Telegram 上的管理员头衔机器人
=============================

Telegram 的群组管理员不能设置自己的头衔，本 Bot 可以帮助克服此缺陷。

将 worker.js 部署到 Cloudflare Workers，联系 Telegram Botfather 创建 bot，
创建一个叫 CT_NAMESPACE 的 Workers KV，
设置环境变量 BOT_TOKEN 为你的 Bot Token，例如 "100000000:ABBBB-m123789aaa"，
并调用 setWebhook API 激活 Bot。

将你的 Bot 添加到群组，授予 Bot 权限。“添加新管理员”（can_promote_members）
权限是必须的。


群主命令
========

下面的命令由群主使用。

参数中的 [user] 表示对目标用户进行指定，可以设定为以下的 3 种:

- 通过回复一条消息，将指定消息发出用户，同时**必须**忽略此参数，
  即不能再指定此参数，如 [回复某人]/grantCT cap_list

- 通过设定用户 ID，如 /grantCT 123456 cap_list

- 除了 /setCTByGroupCreator，也可以指定为 all，表示对全体成员设定，例如
  使用 /grantCT all cap_list 后，全体成员都可以通过此 bot 获得设定的权限并
  设定头衔。注意：全体成员设定优先级低于指定用户的设定。即 all 设定可以被
  针对某一的设定所覆盖。

/grantCT [user] <cap list>
--------------------------

授权某个用户/全体成员，以使其可以使用 Admin Title Bot 成为管理员并设置头衔

configuration 格式为 <权限设置，每个权限名称之间使用半角逗号「,」隔开>，
不得包含额外的空格。

例如

	can_change_info,can_delete_messages,can_invite_users,can_restrict_members

	这表示此用户可以修改群组信息、删除消息、邀请用户，限制用户
	不能添加新的管理员，不能置顶消息

Telegram 的权限名称如下表所示

+------------------------+----------------------------------------------+
| 权限名称               | 描述                                         |
+------------------------+----------------------------------------------+
| can_change_info        | 允许修改群组信息                             |
| can_delete_messages    | 允许删除其他成员的消息                       |
| can_invite_users       | 允许邀请新用户加入群组                       |
| can_restrict_members   | 允许对群组成员进行限制                       |
| can_pin_messages       | 允许置顶消息                                 |
| can_promote_members    | 可以创建新的管理员                           |
| can_manage_voice_chats | 允许管理语音聊天                             |
+------------------------+----------------------------------------------+

/getCT [user]
-------------

获得指定成员/全体成员的配置

/revokeCT [user]
----------------

撤销指定成员/全体成员的配置。

使用此命令不会撤销对应成员的管理员权限。你需要使用 Telegram 解除权限。
此命令撤销用户使用 Admin Title Bot 的能力，使用此命令后对应成员将
不能再设置头衔并成为管理员。

/setCTByGroupCreator [user] <title>
-----------------------------------

注意：不可指定 all

将目标用户的头衔设置为 <title>，并使其成为管理员。

/listCT
-------

列出已配置的用户。形式为可点击的 UID，点击后打开用户的信息页面。

超过 10 个配置时，将会分页显示，点击 “Next page” 按钮即可导航到下一页。
不可以返回到上一页。
超过 30 分钟后按钮将会失效。
受限于 Telegram 的限制，部分用户的 UID 可能无法点击。

提示：不包含 all 的配置，要获取组级别配置，请使用 /getCT all


成员命令
========

/setCustomTitle <title>
-----------------------

设置自己的头衔为 <title>，并成为管理员。

若群主已为当前用户 /grantCT 相关权限后，则按照此设置提升用户的权限。
若当前用户没有设置权限（如没有 /grantCT 或已 /revokeCT），则检查是否为全体
用户设置权限（/grantCT all），如果存在，则按照此设置提升用户的权限。
若也没有设置（如没有 /grantCT all 或已 /revokeCT all），设置头衔将失败。

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

	   现在，Bot 可以修改 D, E, F 和其他非管理员用户的管理员头衔。
	   Bot 不能修改 A, B, C 的管理员头衔，因为它们不和 Bot 在同一个
	   链上。
	   Bot 不能修改 X 的管理员头衔，虽然它们在同一个链上，但是 X 是
	   Bot 的 “先辈” 而不是 “后代”。

	   最佳实践是，群主只授权 Bot，其他管理员成员均通过 Bot 成为管理员
	   （/setCustomTitle 或者 /setCTByGroupCreator）
	   使其他管理员都最终是 Bot 的直接或间接后代。

错误提示：Can not promote member: Bad Request: USER_NOT_MUTUAL_CONTACT

	指定的用户已经不再在群组中了。

错误提示：Can not promote member: Forbidden: RIGHT_FORBIDDEN

	通常是你没有给予 Bot 足够的权限。例如你没有给 Bot can_change_info
	权限，但你通过 /grantCT 给某个/全部用户 can_change_info 权限。则
	用户试图通过 /setCustomTitle 设置头衔时，就会产生此错误。

错误提示：Can not set custom title: Forbidden: RIGHT_FORBIDDEN

	通常是类似这种情况：群主授予 Bot 作为管理员，A 通过 Bot 得到管理员
	和头衔，但是群主又自己编辑了 A 的权限。A 此时自己修改头衔时，在
	有的时候（可能是修改了 Bot 不具备的权限或未在 Bot 处 /grantCT 设置
	的权限）就可能出现这个错误。解决方法很简单。首先使用 /revokeAdmin
	撤销自己的管理员权限，再重新设置即可。
