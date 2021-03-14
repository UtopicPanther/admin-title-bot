const token = BOT_TOKEN;
const botUserId = token.substring(0, token.indexOf(":"));
const debug_user_id = 374451238; // Grant this user all permission so he/she can debug group creator commands. CHANG IT TO YOUR USER ID.

const permList = [
    "can_change_info",
    "can_delete_messages",
    "can_invite_users",
    "can_restrict_members",
    "can_pin_messages",
    "can_manage_voice_chats"
];

/*
 * Utils
 */

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

function BotError(message = "Unknown error", reply_to_id = 0) {
    this.message = message;
    this.reply_to_id = reply_to_id;
}

function buildConfigKey(chatid, userid, name) {
    if (userid == "")
        userid == "0"

    if (!userid)
        userid = "";

    if (name == "")
        name = "@"

    return chatid + ":" + name + ":" + userid;
}

async function getUserConfig(chatid, userid, name) {
    const r = await CT_NAMESPACE.get(buildConfigKey(chatid, userid, name));
    return (r == null ? null : JSON.parse(r));
}

async function setUserConfig(chatid, userid, name, config) {
    const key = buildConfigKey(chatid, userid, name);

    if (config) {
        return await CT_NAMESPACE.put(key, JSON.stringify(config));
    } else {
        return await CT_NAMESPACE.delete(key);
    }
}

async function listUsers(chatid, name, cursor = null) {
    const key = buildConfigKey(chatid, null, name);

    query = {
        "prefix": key
    };

    if (cursor)
        query.cursor = cursor;

    const data = await CT_NAMESPACE.list(query);
    return data;
}

async function assertGroupCreator(chatid, userid) {
    if (userid === debug_user_id)
        return;

    user_info = await tg({
        chat_id: chatid,
        user_id: userid
    }, "getChatMember");

    if (!user_info.ok)
        throw new BotError("Can not get requester info");

    if (user_info.result.status !== "creator")
        throw new BotError("Only creator can use this command");
}

async function setCustomTitle(chatid, userid, title) {
    const perm = await getUserConfig(chatid, userid, "cap");
    if (perm == null) {
        perm = await getUserConfig(chatid, null, ":group_cap");
        if (perm == null) {
            throw new BotError("Permission denied.");
        }
    }

/*
    const me = await tg({
        chat_id: chatid,
        user_id: botUserId
    }, "getChatMember");

    if (!me.ok)
        throw new BotError("Can not get allowed admin permission");

    const allowed_perm = me.result;
*/
    const obj = {};
    for (const p of perm) {
        obj[p] = true
    }

    obj.chat_id = chatid;
    obj.user_id = userid;

    const r = await tg(obj, "promoteChatMember");

    if (!r.ok)
        throw new BotError("Can not promote member: " + r.description);

    await sleep(2000);

    const rr = await tg({
        chat_id: chatid,
        user_id: userid,
        custom_title: title
    }, "setChatAdministratorCustomTitle");

    if (!rr.ok)
        throw new BotError("Can not set custom title: " + rr.description + "\n\nIf you see that it says you are not an administrator, please wait a moment and reset.");

    return perm;
}

/*
 * Handlers
 */

commandsList = {};

async function handleBotCommands(msg) {
    const chatid = msg.chat.id;
    const from_userid = msg.from.id;
    const command = msg.text.split(" ", 2)[0];

    if (command in commandsList) {
        const args = msg.text.split(" ");

        cmd = commandsList[command];
        if (cmd.replyMessageUseridAsArgument &&
                msg.reply_to_message &&
                msg.reply_to_message.from)
            args.splice(1, 0, msg.reply_to_message.from.id);

        try {
            await cmd.func(chatid, from_userid, msg, args);
        } catch(e) {
            if (e instanceof BotError) {
                const tmp = {
                    chat_id: chatid,
                    text: e.message,
                    parse_mode: "html",
                    reply_to_message_id: msg.message_id 
                };

                if (e.reply_to_id > 0)
                    tmp.reply_to_message_id = e.reply_to_id;

                await tg(tmp);
            } else {
                await tg({
                    chat_id: chatid,
                    text: e.message + "\n\n" + e.stack
                });
            }
        }
    }
}

function Command(name, func, replyMessageUseridAsArgument = false) {
    this.name = name;
    this.func = func;
    this.replyMessageUseridAsArgument = replyMessageUseridAsArgument;
}

Command.prototype.realize = function() {
    commandsList[this.name] = this;
}

async function handleRequest(request) {
    try {
        const path = new URL(request.url).pathname;
        const body = await request.json();

        const msg = body.message;

        if (msg && msg.from && msg.text && msg.text[0] === '/') {
            await handleBotCommands(msg);
        }
    } catch(e) {
        return new Response("error: " + e.stack, {status: 200});
    }
    return new Response('', {status: 200});
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

/*
 * Commands
 */

new Command('/setCustomTitle', async function(chatid, userid, msg, args) {
    if (args.length < 2)
        throw new BotError("Syntax error.\nusage: <code>/setCustomTitle NEW_TITLE</code>")

    const list = await setCustomTitle(chatid, userid, args[1]);

    let ufPerm = "";
    list.forEach(p => { ufPerm += p + "\n"; });

    await tg({
        chat_id: chatid,
        text: "OK, set your title to <code> " + args[1] + "</code>\n\nGranted permissions:\n<code>" + ufPerm + "</code>",
        parse_mode: "html",
        reply_to_message_id: msg.message_id
    });
}).realize();

new Command('/revokeAdmin', async function(chatid, userid, msg, args) {
    const np = {
        chat_id: chatid,
        user_id: userid
    };

    permList.forEach(p => {
        np[p] = false;
    });

    const rr = await tg(np, "promoteChatMember");
    await tg({
        chat_id: msg.chat.id,
        text: "Permission revoked.",
        reply_to_message_id: msg.message_id
    });
}).realize();

function GroupCreatorCommand(name, func, allowAll, userConfigName, groupConfigName, argc, usage) {
    this.allowAll = allowAll;
    this.argc = argc;
    this.usage = usage;
    this._func = func;
    this.userConfigName = userConfigName;
    this.groupConfigName = groupConfigName;

    Command.call(this, name, async function(chatid, userid, msg, args) {
        if (args.length < this.argc) {
            let usage = "Syntax error.\nusage: <code>" + this.name + " [user] " + this.usage + "</code>\n\nFor the [user] argument, you can choose one of the following::\n  - to reply a message, user will be ignored and you should NEVER specify it.\n  - a user id";
            if (this.allowAll)
                usage = usage + "\n  - 'all' to do a group-level config";

            throw new BotError(usage);
        }

        if (args[1] == "")
            throw new BotError("empty user argument is not allowed.")

        await assertGroupCreator(chatid, userid);

        let targetUserid = args[1]; 
        let configName = this.userConfigName;
        if (targetUserid === "all") {
            if (this.allowAll) {
                targetUserid = null;
                configName = this.groupConfigName;
            } else {
                throw new BotError("'all' is not allowed for current command.")
            }
        }

        return await this._func(chatid, userid, msg, args, targetUserid, configName);
    }, true);
}
GroupCreatorCommand.prototype = Object.create(Command.prototype);
GroupCreatorCommand.prototype.constructor = GroupCreatorCommand;

new GroupCreatorCommand('/setCTByGroupCreator', async function(chatid, userid, msg, args, targetUserid, configName) {
    const list = await setCustomTitle(chatid, targetUserid, args[2]);

    let ufPerm = "";
    list.forEach(p => { ufPerm += p + "\n"; });

    await tg({
        chat_id: chatid,
        text: "OK, set user's title to <code> " + args[2] + "</code>\n\nGranted permissions:\n<code>" + ufPerm + "</code>",
        parse_mode: "html"
    });
}, false, null, null, 3, "NEW_TITLE").realize();

new GroupCreatorCommand('/grantCT', async function(chatid, userid, msg, args, targetUserid, configName) {
    const perm = args[2].split(",");
    await setUserConfig(chatid, targetUserid, configName, perm);

    await tg({
        chat_id: chatid,
        text: "Configuration for '" + args[1] + "' is done."
    });
}, true, "cap", ":group_cap", 3, "CAP_LIST").realize();

new GroupCreatorCommand('/revokeCT', async function(chatid, userid, msg, args, targetUserid, configName) {
    await setUserConfig(chatid, targetUserid, configName, null);
    await tg({
        chat_id: chatid,
        text: "Configuration for '" + args[1] + "' is done."
    });
}, true, "cap", ":group_cap", 2, "").realize();

new GroupCreatorCommand('/getCT', async function(chatid, userid, msg, args, targetUserid, configName) {
    const perm = await getUserConfig(chatid, targetUserid, configName, null);
    if (perm == null)
        throw new BotError("There aren't any CT configuration for this user")

    let ufPerm = "";
    perm.forEach(p => { ufPerm += p + ","; });
    ufPerm = ufPerm.slice(0, -1);

    await tg({
        chat_id: chatid,
        text: "user's cap configuration is  <code>" + ufPerm + "</code>",
        parse_mode: "html"
    });
}, true, "cap", ":group_cap", 2, "").realize();

new Command('/foreachCT', async function(chatid, userid, msg, args) {
    await assertGroupCreator(chatid, userid);

    // FIXME: limit is 1000, pagination required.
    const data = await listUsers(chatid, "cap");

    let r = "Configured users in group: \n";

    // FIXME: Telegram message length limition.
    data.keys.forEach(i => {
        user_id = i.name.split(":")[2];
        r += "<a href='tg://user?id=" + user_id + "'>" + user_id + "</a>\n";
    });

    await tg({
        chat_id: chatid,
        text: r,
        parse_mode: "html",
        reply_to_message_id: msg.message_id
    });
}).realize();
