addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const token = "1331167233:AAF9XzsBwcHlN_H761Poo-mlXNNzxnvq7GI"; // PUT YOUR TOKEN HERE
const botUserId = token.substring(0, token.indexOf(":"));

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

async function handleRequest(request) {
  try {
    const path = new URL(request.url).pathname;
    const body = await request.json();

    const msg = body.message;

    if (msg.text.startsWith("/kbd")) {
        await tg({
        chat_id: msg.chat.id,
        text: "Keyboard",
        parse_mode: "html",
        reply_markup: {
            one_time_keyboard: true,
            keyboard: [
                [
                    {
                        text:"aaa"
                    },
                    {
                        text:"bbb"
                    }
                ]
            ]
        }
      });
    } else if (msg.text.startsWith("/remove_kbd")) {
        await tg({
        chat_id: msg.chat.id,
        text: "Remove",
        parse_mode: "html",
        reply_markup: {
            remove_keyboard: true
        }
      });
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

        const me = await tg({
          chat_id: msg.chat.id,
          user_id: botUserId
        }, "getChatMember");

        if (!me.ok) await die(msg.chat.id, "Can not get allowed admin permission")

        const perm = me.result;
        const newPerm = {};
        let permUF = "";

        permList.forEach(p => {
          if (perm.hasOwnProperty(p) && perm[p] === true) {
            newPerm[p] = true;
            permUF += p + "\n";
          }
        });

        newPerm.chat_id = msg.chat.id;
        newPerm.user_id = msg["from"].id;

        const r = await tg(newPerm, "promoteChatMember");

        if (!r.ok) await die(msg.chat.id, "Can not promote member: " + r.description);

        await sleep(2000);

        const rr = await tg({
          chat_id: msg.chat.id,
          user_id: msg["from"].id,
          custom_title: title
        }, "setChatAdministratorCustomTitle");

        if (!rr.ok) await die(msg.chat.id, "Can not set custom title: " + rr.description + "\n\nIf you see that it says you are not an administrator, please wait a moment and reset.");

        await tg({
          chat_id: msg.chat.id,
          text: "OK, set your title to <code> " + title + "</code>\n\nGranted permissions:\n<code>" + permUF + "</code>",
          parse_mode: "html",
          reply_to_message_id: msg.message_id
        });
      }
    }

    return new Response('', {status: 200});
  } catch(e) {
    return new Response("error: " + e.stack, {status: 200});
  }
}
