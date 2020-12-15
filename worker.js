addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const token = ""; // PUT YOUR TOKEN HERE
const botUserId = token.substring(0, token.indexOf(":"));

const mode2_group_ids = new Set([]); // Group IDs which will use mode2 (/grantCT, /revokeCT, /getCT, /foreachCT)

const permList = [
  "can_change_info",
  "can_delete_messages",
  "can_invite_users",
  "can_restrict_members",
  "can_pin_messages"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parse_config(message) {
  var obj = {};
  message.split(' ').forEach(value => {
    var keypair = value.split('=');
    obj[keypair[0]] = keypair[1];
  });
  return obj;
}

async function tg(body, method) {
  if (method == null)
    method = "sendMessage";

  const url = 'https://api.telegram.org/bot' + token + '/' + method;

  const headers = {
    'Content-type': 'application/json'
  }

  return (await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  })).json();
}

async function die(id, msg) {
  await tg({
    chat_id: id,
    text: msg
  });
  throw new Error("die");
}

async function _setCustomTitle(chat_id, user_id, message_id, title, _config) {
  let conf = {};

  if (mode2_group_ids.has(chat_id)) {
    if (_config == null) {
      const config = await CT_NAMESPACE.get(chat_id + ":" + user_id);

      if (config == null)
        await die(chat_id, "Permision denied. (mode2 enabled)");

      conf = parse_config(config);
    } else {
      conf = _config
    }
  }

  const me = await tg({
    chat_id: chat_id,
    user_id: botUserId
  }, "getChatMember");

  if (!me.ok) await die(chat_id, "Can not get allowed admin permission")

  const perm = me.result;
  const newPerm = {};
  let permUF = "";

  let allow_perm = permList;
  if (conf.hasOwnProperty("cap")) {
    if (typeof conf.cap === 'string') {
      allow_perm = conf.cap.split(",");
    } else {
      await die(chat_id, "Invalid cap config, please contact group creator.")
    }
  }

  allow_perm.forEach(p => {
    if (perm.hasOwnProperty(p) && perm[p] === true) {
      newPerm[p] = true;
      permUF += p + "\n";
    }
  });

  newPerm.chat_id = chat_id;
  newPerm.user_id = user_id;

  const r = await tg(newPerm, "promoteChatMember");

  if (!r.ok) await die(chat_id, "Can not promote member: " + r.description);

  await sleep(2000);

  const rr = await tg({
    chat_id: chat_id,
    user_id: user_id,
    custom_title: title
  }, "setChatAdministratorCustomTitle");

  if (!rr.ok) await die(chat_id, "Can not set custom title: " + rr.description + "\n\nIf you see that it says you are not an administrator, please wait a moment and reset.");

  await tg({
    chat_id: chat_id,
    text: "OK, set your title to <code> " + title + "</code>\n\nGranted permissions:\n<code>" + permUF + "</code>",
    parse_mode: "html",
    reply_to_message_id: message_id
  });
}

async function mode2_helper(msg, standalone = false) {
  if (!standalone && !msg.hasOwnProperty('reply_to_message'))
    await die(msg.chat.id, "Please specify a user by reply to his/her message.");

  if (!mode2_group_ids.has(msg.chat.id))
    await die(msg.chat.id, "Mode2 is not enabled for this group. id: " + msg.chat.id);

  user_info = await tg({
    chat_id: msg.chat.id,
    user_id: msg["from"].id
  }, "getChatMember");

  if (!user_info.ok)
    await die(msg.chat.id, "Can not get requester info");

  if (user_info.result.status !== "creator")
    await die(msg.chat.id, "Only creator can use this command");
}

async function handleRequest(request) {
  try {
    const path = new URL(request.url).pathname;
    const body = await request.json();

    const msg = body.message;

    if (msg.text.startsWith("/grantCT")) {
      await mode2_helper(msg);

      let i = msg.text.indexOf(" ");
      let config = "";
      if (i > 0) {
        config = msg.text.substring(i + 1);
      }

      await CT_NAMESPACE.put(msg.chat.id + ":" + msg.reply_to_message["from"].id, config);

      await tg({
        chat_id: msg.chat.id,
        text: "Configure for '" + msg.reply_to_message["from"].first_name + "' done",
        reply_to_message_id: msg.message_id
      });

    } else if (msg.text.startsWith("/revokeCT")) {
      await mode2_helper(msg);

      await CT_NAMESPACE.delete(msg.chat.id + ":" + msg.reply_to_message["from"].id);

      await tg({
        chat_id: msg.chat.id,
        text: "Configure for '" + msg.reply_to_message["from"].first_name + "' done",
        reply_to_message_id: msg.message_id
      });

    } else if (msg.text.startsWith("/getCT")) {
      await mode2_helper(msg);

      let config = await CT_NAMESPACE.get(msg.chat.id + ":" + msg.reply_to_message["from"].id);

      if (config == null)
        await die(msg.chat.id, "There are NOT any CT configuration for this user");

      if (config === "") {
        config = "defaults"
      }

      await tg({
        chat_id: msg.chat.id,
        text: "Configurations for '" + msg.reply_to_message["from"].first_name + "' are:\n\n" + config,
        reply_to_message_id: msg.message_id
      });

    } else if (msg.text.startsWith('/setCTByGroupCreator')) {
      await mode2_helper(msg);

      let i = msg.text.indexOf(" ");
      let name = "";
      if (i > 0) {
        name = msg.text.substring(i + 1);
      }

      await _setCustomTitle(msg.chat.id, msg.reply_to_message['from'].id, msg.reply_to_message.message_id, name, null)

    } else if (msg.text.startsWith("/foreachCT")) {
      await mode2_helper(msg, true);

      let i = msg.text.indexOf(" ");
      let option = "show";
      if (i > 0) {
        option = msg.text.substring(i + 1);
      }

      // FIXME: limit is 1000, pagination required.
      const data = await CT_NAMESPACE.list({"prefix": msg.chat.id + ":"});
      switch (option) {
        case "show":
          let r = "There are configured users: \n";

          // FIXME: Telegram message length limition.
          data.keys.forEach(i => {
            r += i.name + "\n"
          });

          await tg({
            chat_id: msg.chat.id,
            text: r,
            reply_to_message_id: msg.message_id
          });
          break;
        case "delete":
          data.keys.forEach(async i => {
            await CT_NAMESPACE.delete(i.name)
          });
          await tg({
            chat_id: msg.chat.id,
            text: "Done",
            reply_to_message_id: msg.message_id
          });
          break;
      }

    } else if (msg.text.startsWith("/revokeAdmin")) {
      const np = {
        chat_id: msg.chat.id,
        user_id: msg["from"].id
      };

      permList.forEach(p => {
        np[p] = false;
      });

      const rr = await tg(np, "promoteChatMember");
      await tg({
        chat_id: msg.chat.id,
        text: "Permission revoked.",
        parse_mode: "html",
        reply_to_message_id: msg.message_id
      });

    } else if (msg.text.startsWith('/setCustomTitle')) {
      const i = msg.text.indexOf(" ");
      if (i <= 0) {
        await tg({
          chat_id: msg.chat.id,
          text: "syntax error.\nusage: <code>/setCustomTitle NEW_TITLE</code>",
          parse_mode: "html",
          reply_to_message_id: msg.message_id
        });
      } else {
        const title = msg.text.substring(i + 1);
        await _setCustomTitle(msg.chat.id, msg["from"].id, msg.message_id, title, null);
      }
    }

    return new Response('', {status: 200});
  } catch(e) {
    return new Response("error: " + e.stack, {status: 200});
  }
}
