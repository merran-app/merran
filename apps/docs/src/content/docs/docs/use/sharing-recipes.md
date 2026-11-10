---
title: Sharing recipes
description: Send a recipe to anyone as a link, so they can read it and cook from it without an account.
---

Send one recipe to friends and family as a link. They open it in their browser, read it, scale it and cook from it, and they don't need an account on your server.

## Share a recipe

1. Open the recipe and choose **Share**.
2. Where your browser has its own share sheet, it opens: phones, and Chrome, Edge and Safari on desktop. Pick Messages, Mail, WhatsApp or whatever you usually send with. Where it has none, Merran copies the link and shows **Link copied**.

**Expected result:** the recipe shows **Shared** beside its title. Choose **Share** again and a panel opens with the link, **Copy link**, **Share…** and **Stop sharing**. **Share…** opens the share sheet again, and you can also find **Share** in a recipe's menu.

Each recipe has one link. It shows the recipe as it is now, so if you fix an ingredient later, everyone with the link sees the fix.

## What people with the link can do

Without signing in, they can:

- read the recipe, with its photo, times, ingredients, steps and nutrition
- change the servings and switch between **As written**, **Metric** and **US**
- choose **Start cooking** and cook with steps and timers, with the screen kept awake where their device allows it

They can't change the recipe, use the assistant or stand-ins, or see your notes, ratings, costs, plan or pantry. Nothing else about your household is visible beyond its name, shown as **Shared by** your household.

Link previews show the recipe's photo and title in Messages, Mail and similar apps. Other recipe apps, and Merran's own import, can read the link too: at the foot of the page, "Use a recipe app? Paste this link into it to save a copy."

Anyone who has the link can pass it on, so share it as you would a link to a document set to "anyone with the link".

## Stop sharing

In the panel, choose **Stop sharing** and confirm. The link stops working for new visits, and the page says **This recipe isn't shared anymore**. Someone who already has the recipe open can keep using it until they reload. Sharing the recipe again makes a new link, and the old one stays dead.

A link keeps working if the member who made it leaves the household. An admin can stop it.

## For admins

Open **Settings → Recipes → Recipe links**.

- **Let members share recipes by link** turns sharing on or off for the household. Turning it off pauses every link: they answer as if they were stopped, and Share disappears for members. Turning it back on brings the same links back.
- **Shared recipes** lists each shared recipe, who shared it, when, and when it was last opened. Each has **Stop sharing**. Recipes in Recently deleted stay on the list, so you can stop them too.

## The server's public address

Links are built from the address in `MERRAN_PUBLIC_URL`, never from the address a request arrived on. If your admin hasn't set it, Share explains that and doesn't make a link. Set it to the address people reach your server at, usually an HTTPS one, and restart. See [configuration](../../run/configuration/) for how settings work and [HTTPS and remote access](../../run/https-and-remote-access/) for making the server reachable from outside your home.

Anyone you share with needs to reach that address, so a server that only works on your home network only shares with people on it.
