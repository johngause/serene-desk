---
layout: page.njk
permalink: /help/
title: Help
description: Help for Serene Desk orders, delivery, returns and checkout.
---
{% if config.helpCenterUrl %}<p><a class="textlink" href="{{ config.helpCenterUrl }}">Visit the help center</a></p>{% else %}<div class="pending">[COPY PENDING: help center link]</div>{% endif %}

<p><button type="button" class="btn lamp" data-open-chat>Chat with {{ config.agentName }}</button></p>

<div class="pending">[COPY PENDING: help page intro]</div>
