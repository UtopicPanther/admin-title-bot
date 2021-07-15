const token = BOT_TOKEN;
const botUserId = token.substring(0, token.indexOf(":"));
const debug_user_id = 374451238; // Grant this user all permission so he/she can debug group creator commands. CHANG IT TO YOUR USER ID.

const permList = [
    "can_change_info",
    "can_delete_messages",
    "can_invite_users",
    "can_restrict_members",
    "can_pin_messages",
    "can_promote_members",
    "can_manage_voice_chats"
];

/*
 * Utils
 */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function BotError(message = "Unknown error", reply_to_id = 0) {
    this.message = message;
    this.reply_to_id = reply_to_id;

    Error.captureStackTrace(this, BotError);
}

BotError.prototype = Object.create(Error.prototype);
BotError.prototype.name = "BotError";
BotError.prototype.constructor = BotError;

async function tg(body, method, autothrow) {
    if (method == null)
        method = "sendMessage";

    const url = 'https://api.telegram.org/bot' + token + '/' + method;

    const headers = {
        'Content-type': 'application/json'
    }

    const r = await (await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    })).json();

    if (autothrow && !r.ok)
        throw new BotError("Error: " + r.description);

    return r;
}

const group_level_configs_map = new Map();
group_level_configs_map.set("all", ":group_cap")
group_level_configs_map.set("bot", ":bot_cap")

function buildConfigKey(chatid, userid, name) {
    if (!userid)
        userid = "";

    if (name == "")
        name = "@"

    if (group_level_configs_map.has(userid)) {
        name = group_level_configs_map.get(userid);
        userid = "";
    }

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
        "prefix": key,
        "limit": 10
    };

    if (cursor)
        query.cursor = cursor;

    const data = await CT_NAMESPACE.list(query);
    return data;
}

async function assertGroupCreator(chatid, userid) {
    if (userid === debug_user_id)
        return;

    const user_info = await tg({
        chat_id: chatid,
        user_id: userid
    }, "getChatMember", true);

    if (user_info.result.status !== "creator")
        throw new BotError("Only creator can use this command");
}

async function assertGroupCreatorOrAdmin(chatid, userid) {
    const member = (await tg({
        chat_id: chatid,
        user_id: userid
    }, "getChatMember", true)).result;

    if (member.status !== "creator" &&
        member.status !== "administrator" &&
        member.user.id !== debug_user_id)
        throw new BotError("Only creator/administrators can use this command.");

    return member;
}

async function assertUseridIsBot(chatid, userid) {
    const member = (await tg({
        chat_id: chatid,
        user_id: userid
    }, "getChatMember", true)).result;

    if (!member.user.is_bot)
        throw new BotError("Target user is not a bot.")
}

async function setCustomTitle(chatid, userid, title, perm = null) {
    if (!perm) {
        perm = await getUserConfig(chatid, userid, "cap");
        if (perm == null) {
            perm = await getUserConfig(chatid, null, ":group_cap");
            if (perm == null) {
                throw new BotError("Permission denied.");
            }
        }
    }

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
callbackQueryList = {};

async function handleBotCommands(msg) {
    const chatid = msg.chat.id;
    const from_userid = msg.from.id;
    let command = msg.text.split(" ", 2)[0].toLowerCase();

    const atp = command.indexOf("@");
    if (atp > 0)
        command = command.substring(0, atp);

    if (command in commandsList) {
        cmd = commandsList[command];

        let args = msg.text;
        if (!cmd.rawArgs)
            args = msg.text.split(" ").filter(i => (i != ""));
        if (cmd.replyMessageUseridAsArgument) {
            if (msg.reply_to_message &&
                    msg.reply_to_message.from) {
                args.splice(1, 0, msg.reply_to_message.from.id);
            } else if (msg.entities && msg.entities.length > 0) {
                // FIXME: require a new feature in bot API, see https://github.com/tdlib/telegram-bot-api/issues/107
                // for (const e of msg.entities) {}
            }
        }


        try {
            await cmd.func(chatid, from_userid, msg, args);
        } catch(e) {
            /*tg({
                chat_id: debug_user_id,
                text: e.stack
            });*/
            if (e instanceof BotError) {
                const tmp = {
                    chat_id: chatid,
                    text: e.message,
                    parse_mode: "html",
                    reply_to_message_id: msg.message_id,
                    allow_sending_without_reply: true
                };

                if (e.reply_to_id > 0)
                    tmp.reply_to_message_id = e.reply_to_id;

                await tg(tmp);
            } else {
                await tg({
                    chat_id: chatid,
                    text: e.stack
                });
            }
        }
    }
}

async function handleCallbackQuery(query) {
    let answer = true;

    if (query.message && query.data) {
        const msg = query.message;
        const chatid = msg.chat.id;
        const from_userid = query.from.id;

        let prefix = query.data.split(":", 2)[0].toLowerCase();
        if (prefix in callbackQueryList) {
            handler = callbackQueryList[prefix];
            const args = query.data.split(":");

            if (args.length === handler.argc) {
                if (handler.noanswer)
                    answer = false;

                try {
                    await handler.func(chatid, from_userid, query, args);
                } catch(e) {
                    if (e instanceof BotError) {
                        answer = false;

                        await tg({
                            callback_query_id: query.id,
                            text: e.message,
                            show_alert: true
                        }, "answerCallbackQuery");
                    } else {
                        await tg({
                            chat_id: chatid,
                            text: e.stack
                        });
                    }
                }
            }
        }
    }

    if (answer) {
        await tg({
            callback_query_id: query.id
        }, "answerCallbackQuery");
    }
}

async function handleChatMemberUpdates(member) {
    function isMember(chatMember) {
        return chatMember.status === "creator" ||
                chatMember.status === "administrator" ||
                chatMember.status === "member" ||
                (chatMember.status === "restricted" && oldinfo.is_member);
    }

    const oldinfo = member.old_chat_member;
    const newinfo = member.new_chat_member;

    const chatid = member.chat.id;

    const wasMember = isMember(oldinfo);
    const curIsMember = isMember(newinfo)

    const userid = newinfo.user.id;

    if (!wasMember && curIsMember && handleChatMemberAdded) {
        await handleChatMemberAdded(chatid, userid, newinfo);
    } else if (wasMember && curIsMember) {
        if (oldinfo.status === "administrator" && newinfo.status === "member" && handleChatMemberDismissed) {
            await handleChatMemberDismissed(chatid, userid, newinfo);
        }
    }

}

function Command(name, func, replyMessageUseridAsArgument = false, rawArgs = false) {
    this.name = name.toLowerCase();
    this.func = func;
    this.replyMessageUseridAsArgument = replyMessageUseridAsArgument;
    this.rawArgs = rawArgs;
}

Command.prototype.realize = function() {
    commandsList[this.name] = this;
}

function CallbackQuery(name, argc, func, noanswer = false) {
    this.name = name.toLowerCase();
    this.argc = argc + 1;
    this.func = func;
    this.noanswer = noanswer;
}

CallbackQuery.prototype.realize = function() {
    callbackQueryList[this.name] = this;
}

async function handleRequest(request) {
    try {
        const path = new URL(request.url).pathname;
        const body = await request.json();

        const msg = body.message;

        if (msg && msg.from && msg.text && msg.text[0] === '/') {
            await handleBotCommands(msg);
        } else if (body.callback_query) {
            await handleCallbackQuery(body.callback_query)
        } else if (body.chat_member && handleChatMemberUpdates) {
            await handleChatMemberUpdates(body.chat_member)
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
    spacePos = args.indexOf(" ");

    if (spacePos < 0)
        throw new BotError("Syntax error.\nusage: <code>/setCustomTitle NEW_TITLE</code>")

    newTitle = args.substring(spacePos + 1).trim()

    const list = await setCustomTitle(chatid, userid, newTitle);

    let ufPerm = "";
    list.forEach(p => { ufPerm += p + "\n"; });

    await tg({
        chat_id: chatid,
        text: "OK, set your title to <code> " + newTitle + "</code>\n\nGranted permissions:\n<code>" + ufPerm + "</code>",
        parse_mode: "html",
        reply_to_message_id: msg.message_id
    });
}, false, true).realize();

new Command('/revokeAdmin', async function(chatid, userid, msg, args) {
    const np = {
        chat_id: chatid,
        user_id: userid
    };

    permList.forEach(p => {
        np[p] = false;
    });

    const rr = await tg(np, "promoteChatMember", true);
    await tg({
        chat_id: msg.chat.id,
        text: "Permission revoked.",
        reply_to_message_id: msg.message_id
    });
}).realize();

function GroupCreatorCommand(name, func, allowGLC, argc, usage) {
    this.allowGLC = allowGLC;
    this.argc = argc;
    this.usage = usage;
    this._func = func;

    Command.call(this, name, async function(chatid, userid, msg, args) {
        if (args.length < this.argc) {
            let usage = "Syntax error.\nusage: <code>" + this.name + " [user] " + this.usage + "</code>\n\nFor the [user] argument, you can choose one of the following:\n  - to reply a message, user will be ignored and you should NEVER specify it.\n  - a user id. (for example, " + debug_user_id + ")";
            if (this.allowGLC) {
                usage = usage + "\n  - 'all' to do a group-level fallback config.\n  - 'bot' to do a group-level bot bounding config.";
            }

            throw new BotError(usage);
        }

        if (args[1] == "")
            throw new BotError("empty user argument is not allowed.")

        await assertGroupCreator(chatid, userid);

        let targetUserid = args[1]; 
        if (!this.allowGLC && group_level_configs_map.has(targetUserid))
            throw new BotError("group-level configs is not allowed for current command.")

        return await this._func(chatid, userid, msg, args, targetUserid);
    }, true);
}
GroupCreatorCommand.prototype = Object.create(Command.prototype);
GroupCreatorCommand.prototype.constructor = GroupCreatorCommand;

new GroupCreatorCommand('/setCTByGroupCreator', async function(chatid, userid, msg, args, targetUserid) {
    const list = await setCustomTitle(chatid, targetUserid, args[2]);

    let ufPerm = "";
    list.forEach(p => { ufPerm += p + "\n"; });

    await tg({
        chat_id: chatid,
        text: "OK, set user's title to <code> " + args[2] + "</code>\n\nGranted permissions:\n<code>" + ufPerm + "</code>",
        parse_mode: "html"
    });
}, false, 3, "NEW_TITLE").realize();

new GroupCreatorCommand('/grantCT', async function(chatid, userid, msg, args, targetUserid) {
    const perm = args[2].split(",");
    await setUserConfig(chatid, targetUserid, "cap", perm);

    await tg({
        chat_id: chatid,
        text: "Configuration for '" + args[1] + "' is done."
    });
}, true, 3, "CAP_LIST").realize();

new GroupCreatorCommand('/revokeCT', async function(chatid, userid, msg, args, targetUserid) {
    await setUserConfig(chatid, targetUserid, "cap", null);
    await tg({
        chat_id: chatid,
        text: "Configuration for '" + args[1] + "' is done."
    });
}, true, 2, "").realize();

new GroupCreatorCommand('/getCT', async function(chatid, userid, msg, args, targetUserid) {
    const perm = await getUserConfig(chatid, targetUserid, "cap", null);
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
}, true, 2, "").realize();

function buildEditCTReplyMarkup(perm, canRevoke, targetUser) {
    const markup = [];
    for (const p of permList) {
        if (perm.has(p)) {
            markup.push([ { text: "✅ " + p, callback_data: "editCT:x:" + p } ]);
        } else {
            markup.push([ { text: "❌ " + p, callback_data: "editCT:_:" + p } ]);
        }
    }

    if (canRevoke)
        markup.push([ { text: "Revoke CT", callback_data: "revokeCT:" + targetUser } ]);

    markup.push([ { text: "Submit", callback_data: "editCT.submit:" + targetUser } ]);

    return markup;
}

new GroupCreatorCommand('/editCT', async function(chatid, userid, msg, args, targetUserid) {
    let targetUser = targetUserid;
    if (targetUser == null)
        targetUser = "all"

    const _perm = await getUserConfig(chatid, targetUserid, "cap", null);
    const perm = new Set(_perm);

    await tg({
        chat_id: chatid,
        text: "Config for user: <code>" + targetUser + "</code>",
        parse_mode: "html",
        reply_markup: {
            inline_keyboard: buildEditCTReplyMarkup(perm, (_perm != null), targetUser)
        }
    }, null, true);
}, true, 2, "").realize();

async function buildListCTMessage(chatid, data, ck = null) {
    let text = "Configured users: \n";

    data.keys.forEach(i => {
        user_id = i.name.split(":")[2];
        text += "<a href='tg://user?id=" + user_id + "'>" + user_id + "</a>\n";
    });

    const r = {
        chat_id: chatid,
        text: text,
        parse_mode: "html",
    }

    if (!data.list_complete) {
        if (!ck)
            ck = new Date().getTime();

        await CT_CURSOR_NAMESPACE.put(chatid + ":" + ck, data.cursor, { expirationTtl: 1800 });

        r.reply_markup = {
            inline_keyboard: [
                [ { text: "Next page", callback_data: "listCT:" + ck } ]
            ]
        };
    }

    return r;
}

new Command('/listCT', async function(chatid, userid, msg, args) {
    await assertGroupCreator(chatid, userid);

    const data = await listUsers(chatid, "cap");
    const r = await buildListCTMessage(chatid, data);

    await tg(r, null, true);
}).realize();

new Command('/setbotCT', async function(chatid, userid, msg, args) {
    let botuid = null;
    if (msg.reply_to_message && msg.reply_to_message.from &&
            msg.reply_to_message.from.is_bot) {
        botuid = msg.reply_to_message.from.id;
    }

    if (!botuid || args.length < 2) {
        throw new BotError("Syntax error. usage: <code>_reply_to_some_bot_ /setbotCT NEW_TITLE [PERMS]</code>\n\n");
    }

    let xperm = new Set();
    if (args.length >= 3) {
        xperm = new Set(args[2].split(","));
    }

    const _perm = await getUserConfig(chatid, null, ":bot_cap", null);
    if (!_perm)
        throw new BotError("No bot bounding configuration. run '/grantCT bot PERM' or '/editCT bot' first.");

    const member = await assertGroupCreatorOrAdmin(chatid, userid);

    //await assertUseridIsBot(chatid, botuid);

    const perm = new Set(_perm);

    let removedUfPerm = "";
    let isAdmin = false;
    if (member.status === "administrator")
        isAdmin = true;

    for (const p of permList) {
        if (isAdmin && !member[p]) {
            if (perm.delete(p))
                removedUfPerm += "<s>" + p + "</s>\n"
        } else if (!xperm.has(p)) {
            if (perm.delete(p))
                removedUfPerm += "<s>" + p + "</s> *\n"
        }
    }

    const list = await setCustomTitle(chatid, botuid, args[1], [...perm]);

    let ufPerm = "";
    list.forEach(p => { ufPerm += p + "\n"; });

    await tg({
        chat_id: chatid,
        text: "OK, set bot's title to <code> " + args[1] + "</code>\n\nGranted permissions:\n<code>" + ufPerm + "</code>" + removedUfPerm,
        parse_mode: "html",
        reply_to_message_id: msg.message_id
    });
}).realize();

new Command('/revokebotCT', async function(chatid, userid, msg, args) {
    let botuid = null;
    if (msg.reply_to_message && msg.reply_to_message.from &&
            msg.reply_to_message.from.is_bot) {
        botuid = msg.reply_to_message.from.id;
    } else {
        throw new BotError("Syntax error. usage: <code>_reply_to_some_bot_ /revokebotCT</code>\n\n");
    }

    const _perm = await getUserConfig(chatid, null, ":bot_cap", null);
    if (!_perm)
        throw new BotError("No bot bounding configuration. run '/grantCT bot PERM' or '/editCT bot' first.");

    const member = await assertGroupCreatorOrAdmin(chatid, userid);

    //await assertUseridIsBot(chatid, botuid);

    const np = {
        chat_id: chatid,
        user_id: userid
    };

    for (const p of permList) {
        np[p] = false;
    }

    const rr = await tg(np, "promoteChatMember", true);
    await tg({
        chat_id: msg.chat.id,
        text: "Permission revoked.",
        reply_to_message_id: msg.message_id
    });
}).realize();

/*
 * Callback queries
 */

new CallbackQuery('listCT', 1, async function(chatid, userid, query, args) {
    await assertGroupCreator(chatid, userid);

    const ck = args[1];
    const cursor = await CT_CURSOR_NAMESPACE.get(chatid + ":" + ck);
    if (!cursor)
        throw new BotError("Session expired.")

    const data = await listUsers(chatid, "cap", cursor);

    const r = await buildListCTMessage(chatid, data, ck);
    r.message_id = query.message.message_id;

    await tg(r, "editMessageText", true);
}).realize();

function parseEditCTInlineKeyboard(message, args) {
    const perm = new Set();
    let targetUser = null;

    if (message.reply_markup && message.reply_markup.inline_keyboard) {
        for (const e of message.reply_markup.inline_keyboard) {
            const a = e[0].callback_data.split(":");
            if (a.length === 3 && a[0] === "editCT") {
                if (args && args[2] === a[2]) {
                    if (args[1] === "_")
                        perm.add(a[2]);
                } else if (a[1] === "x") {
                    perm.add(a[2]);
                }
            } else if (a.length == 2 && a[0] === "editCT.submit") {
                targetUser = a[1];
            }
        }
    }

    return [perm, targetUser];
}

new CallbackQuery('revokeCT', 1, async function(chatid, userid, query, args) {
    await assertGroupCreator(chatid, userid);

    const message = query.message;
    const targetUser = args[1];

    await setUserConfig(chatid, targetUser, "cap", null);

    await tg({
        chat_id: chatid,
        text: "Configuration for '" + targetUser + "' is done."
    }, null, true);

    await tg({
        chat_id: chatid,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: [] }
    }, "editMessageReplyMarkup", true);
}).realize();

new CallbackQuery('editCT', 2, async function(chatid, userid, query, args) {
    await assertGroupCreator(chatid, userid);

    const message = query.message;
    const [ perm, targetUser ] = parseEditCTInlineKeyboard(message, args);

    await tg({
        chat_id: chatid,
        message_id: message.message_id,
        reply_markup: {
            inline_keyboard: buildEditCTReplyMarkup(perm, false, targetUser)
        }
    }, "editMessageReplyMarkup", true);
}).realize();

new CallbackQuery('editCT.submit', 1, async function(chatid, userid, query, args) {
    await assertGroupCreator(chatid, userid);

    const message = query.message;
    const [ _perm, targetUser ] = parseEditCTInlineKeyboard(message);
    const perm = [..._perm];

    if (perm.length === 0)
        throw new BotError("Perm List is empty. If you want to revoke CT configuration, please use /revokeCT or Revoke button.")

    await setUserConfig(chatid, targetUser, "cap", perm);

    await tg({
        chat_id: chatid,
        text: "Configuration for '" + targetUser + "' is done."
    }, null, true);

    await tg({
        chat_id: chatid,
        message_id: message.message_id,
        reply_markup: { inline_keyboard: [] }
    }, "editMessageReplyMarkup", true);
}).realize();

new CallbackQuery('deleteMessage.admin', 0, async function(chatid, userid, query, args) {
    await assertGroupCreator(chatid, userid);

    const message = query.message;

    await tg({
        chat_id: chatid,
        message_id: message.message_id
    }, "deleteMessage", true);
}).realize();

/*
 * Chat member handlers
 */

async function handleChatMemberDismissed(chatid, userid, chatMember) {
    const perm = await getUserConfig(chatid, userid, "cap", null);
    const userFriendlyName = chatMember.user.first_name;

    if (perm) {
        await tg({
            chat_id: chatid,
            text: "User <code>" + userid + " (" + userFriendlyName + ")</code> has been dismissed from administrators, revoke his/her/its CT configuration too?",
            parse_mode: "html",
            reply_markup: {
                inline_keyboard: [
                    [ { text: "Revoke CT", callback_data: "revokeCT:" + userid } ],
                    [ { text: "Retain CT", callback_data: "deleteMessage.admin" } ]
                ]
            }
        }, null, true);
    }
}
