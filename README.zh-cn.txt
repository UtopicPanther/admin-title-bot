Telegram 上的管理员头衔机器人
=============================

Telegram 的群组管理员不能设置自己的头衔，本 Bot 可以帮助克服此缺陷。

Admin Title Bot 共有两种工作模式

mode1: 群组中的任何用户都可以设置自己的头衔（默认）
mode2: 只有被创建者授权的用户才可以设置自己的头衔

将你的群组 ID 添加到 worker.js 的 mode2_group_ids 集合中，
即可为你的群组启用 mode2

将 worker.js 部署到 Cloudflare Workers，联系 Telegram Botfather 创建 bot，
并调用 setWebhook API 激活 Bot。
如果你要使用 mode2，你需要创建一个叫 CT_NAMESPACE 的 Workers KV。

将你的 Bot 添加到群组，授予 Bot 权限。“添加新管理员”（can_promote_members）
权限是必须的。


权限
====

mode1
-----

如果要在 mode1 下使用，除了需要添加 “添加新管理员”（can_promote_members）
权限，你还必须添加至少一个权限。

当用户通过 mode1 设置头衔时，他会自动成为管理员，并且获得除
“添加新管理员”（can_promote_members）以外的 Bot 持有的全部权限。

mode2
-----

mode2 下将可以配置每个用户能获得的权限。要使设置的权限名称生效，你还需要给
Bot 相应的权限


群主命令（仅限 mode2）
=====================

下面的命令由群主使用，并只在 mode2 群组中生效。

/grantCT <configuration>
------------------------

对目标用户的一则消息进行回复，以指定成员。

授权某个用户，以使其可以使用 Admin Title Bot 成为管理员并设置头衔

configuration 格式

	cap=<权限设置，每个权限名称之间使用半角逗号「,」隔开>

例如

	cap=can_change_info,can_delete_messages,can_invite_users,can_restrict_members

	这表示此用户可以修改群组信息、删除消息、邀请用户，限制用户
	不能添加新的管理员，不能置顶消息

Telegram 的权限名称如下表所示

+-----------------------+-----------------------------------------------+
| 权限名称              | 描述                                          |
+-----------------------+-----------------------------------------------+
| can_change_info       | 允许修改群组信息                              |
| can_delete_messages   | 允许删除其他成员的消息                        |
| can_invite_users      | 允许邀请新用户加入群组                        |
| can_restrict_members  | 允许对群组成员进行限制                        |
| can_pin_messages      | 允许置顶消息                                  |
| can_promote_members   | 可以创建新的管理员                            |
+-----------------------+-----------------------------------------------+

/getCT
------

对目标用户的一则消息进行回复，以指定成员。

获得指定成员的配置

/revokeCT
---------

对目标用户的一则消息进行回复，以指定成员。

撤销指定成员的配置。

使用此命令不会撤销对应成员的管理员权限。你需要使用 Telegram 解除权限。
此命令撤销用户使用 Admin Title Bot 的能力，使用此命令后对应成员将
不能再设置头衔并成为管理员。

/setCTByGroupCreator <title>
----------------------------

对目标用户的一则消息进行回复，以指定成员。

将目标用户的头衔设置为 <title>，并使其成为管理员


成员命令
========

/setCustomTitle <title>
-----------------------

设置自己的头衔为 <title>，并成为管理员。

若群组已启用 mode2，未经授权的用户不能使用此命令。

/revokeAdmin
------------

移除自己的头衔和管理员权限。


常见问题
========

错误提示：Can not promote member: Bad Request: method is available for
supergroup and channel chats only

	你需要将群组升级为超级群组。

错误提示：Can not promote member: Bad Request: can't remove chat owner

	群主不能使用 Bot 修改头衔，而应使用 Telegram 界面。

错误提示：Can not promote member: Bad Request: not enough rights

	1. 确认已给 Bot 添加“添加新管理员”（can_promote_members）权限。
	2. Bot 无法修改不是来自 Bot 的管理员链上的“后代”用户的头衔

	   群主授予了 A，B, X 作为管理员
	   X 授予了 Bot 作为管理员
	   A 授予了 C 作为管理员
	   Bot 授予了 D，E 作为管理员
	   D 授予了 F 作为管理员

	   现在，Bot 可以修改 D, E, F 和其他非管理员用户的管理员头衔
	   Bot 不能修改 A, B, C 的管理员头衔，因为它们不是 Bot 的“后代”
	   Bot 不能修改 X 的管理员头衔，因为 X 是 Bot 的“先辈”

	   最佳实践是，群主只授权 Bot，其他管理员成员均通过 Bot 成为管理员
	   （/setCustomTitle 或者 /setCTByGroupCreator）
	   使其他管理员都最终是 Bot 的直接或间接后代。

错误提示：Can not promote member: Bad Request: USER_NOT_MUTUAL_CONTACT

	对应消息的发送者已经不再在群组中了。

为什么缺少管理语音消息的权限。

	因为当前的 Telegram Bot API 不支持它。它在未来可能得到支持。
