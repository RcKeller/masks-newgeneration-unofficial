import { configSheet } from "./helpers/config-sheet";
import * as utils from "./helpers/utils";
import { MasksActorSheetMixin } from './sheets/actor-sheet';
import { CallSheet, registerCallSheetQueries, registerCallSheetSocketHandler } from './sheets/call-sheet';

Hooks.once("init", () => {
    const masksActorSheet = MasksActorSheetMixin(game.pbta.applications.actor.PbtaActorSheet);
    Actors.unregisterSheet('pbta', game.pbta.applications.actor.PbtaActorSheet, { types: ['character'] });
    Actors.registerSheet('pbta', masksActorSheet, {
        types: ['character'],
        makeDefault: true,
        label: 'DISPATCH.SheetConfig.character',
    });

    // Call sheet for "other" actor type (custom subtype "call")
    Actors.registerSheet('masks-newgeneration-unofficial', CallSheet, {
        types: ['other'],
        makeDefault: true,
        label: 'DISPATCH.SheetConfig.call',
    });

    game.settings.register("masks-newgeneration-unofficial", "enable_dark_mode", {
        name: "DISPATCH.Settings.enable_dark_mode.name",
        hint: "DISPATCH.Settings.enable_dark_mode.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true
    });

    var head = document.getElementsByTagName('HEAD')[0];
    if (game.settings.get("masks-newgeneration-unofficial","enable_dark_mode")){
		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.href = 'modules/masks-newgeneration-unofficial/assets/dark-mode.css';
		//Append link element to HTML head
		head.appendChild(link);
	}

    // Register settings
    game.settings.register('masks-newgeneration-unofficial', 'firstTime', {
        name: 'First Time Startup',
        scope: 'world',
        config: false,
        type: Boolean,
        default: true,
    });

    // Preload Handlebars stuff.
    utils.preloadHandlebarsTemplates();

    // Register handlebars helpers for V2 sheets
    Handlebars.registerHelper("gt", function(a, b) {
        return Number(a) > Number(b);
    });

    Handlebars.registerHelper("gte", function(a, b) {
        return Number(a) >= Number(b);
    });

    Handlebars.registerHelper("lte", function(a, b) {
        return Number(a) <= Number(b);
    });

    Handlebars.registerHelper("lt", function(a, b) {
        return Number(a) < Number(b);
    });

    // NOTE: Do NOT register a custom "times" helper - PbtA provides one that is 0-indexed
    // and provides @index, @first, @last via the Handlebars data frame. Our custom 1-indexed
    // version was breaking Clock/Xp pips. Use {{sum @index 1}} if you need 1-indexed display.

    // getLabel helper for move types
    Handlebars.registerHelper("getLabel", function(obj, key) {
        if (!obj || !key) return "";
        return obj[key]?.label ?? key;
    });

    // stripUuidLinks helper - converts @UUID[Type.id]{Label} to just Label
    // Used for displaying move descriptions before lazy enrichment
    Handlebars.registerHelper("stripUuidLinks", function(text) {
        if (!text) return "";
        // Convert @UUID[Type.id]{Label} to just Label
        // Also handle @UUID[Type.id] without label (use "link" as fallback)
        return new Handlebars.SafeString(
            String(text)
                .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, "$1")
                .replace(/@UUID\[[^\]]+\]/g, "[link]")
        );
    });
});

Hooks.once('ready', async function () {
    // Register query handlers for call sheet actions (V13+ query system)
    registerCallSheetQueries();

    // Register socket handler for call sheet actions (Show to Everyone)
    registerCallSheetSocketHandler();

    if (!game.user.isGM) return;
    if (game.settings.get('masks-newgeneration-unofficial', 'firstTime')) {
        game.settings.set('masks-newgeneration-unofficial', 'firstTime', false);

        const callback = async () => {
            game.settings.set('masks-newgeneration-unofficial', 'firstTime', true);
            const worldData = {
                id: game.world.id,
                action: 'editWorld',
                background: `modules/masks-newgeneration-unofficial/images/login-bg-lt.webp`,
            };
            let response;
            try {
                response = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute('setup'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(worldData),
                });
                if (response.error) {
                        ui.notifications.error(response.error);
                } else if (!response) {
                        game.world.updateSource(response);
                }
            } catch (e) {
                return ui.notifications.error(e);
            }
        };

        foundry.applications.api.DialogV2.confirm({
            window: { title: 'Welcome to Masks: A New Generation!' },
            content: '<p>Would you like to use a Masks theme for your login screen?</p>',
            rejectClose: false,
            modal: true,
            yes: { callback: callback },
        });
    } else {
        if (game.settings.settings.has('masks-newgeneration-unofficial.enableLoginImg')) {
            if (game.settings.get('masks-newgeneration-unofficial', 'enableLoginImg')) {
                const worldData = {
                    id: game.world.id,
                    action: 'editWorld',
                    background: `modules/masks-newgeneration-unofficial/images/login-bg-lt.webp`,
                };
                let response;
                try {
                    response = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute('setup'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(worldData),
                    });
                    if (response.error) {
                        ui.notifications.error(response.error);
                    } else if (!response) {
                        game.world.updateSource(response);
                    }
                } catch (e) {
                  return ui.notifications.error(e);
                }
            }
        }
    }
});

Hooks.once('pbtaSheetConfig', () => {
    // Disable the sheet config form.
    game.settings.set('pbta', 'sheetConfigOverride', true);

    // Replace the game.pbta.sheetConfig with your own version.
    configSheet();

    // PBTA Settings
    game.settings.set('pbta', 'advForward', false);
    game.settings.set('pbta', 'hideRollFormula', true);
    game.settings.set('pbta', 'hideForward', false);
    game.settings.set('pbta', 'hideOngoing', false);
    game.settings.set('pbta', 'hideRollMode', true);
    game.settings.set('pbta', 'hideUses', true);
    
    if (game.settings.settings.has('pbta.hideAdvancement')) {
        game.settings.set('pbta', 'hideAdvancement', "both");
    }

    if (game.settings.settings.has('pbta.hideHold')) {
        game.settings.set('pbta', 'hideHold', true);
    }
});

Hooks.on("preCreateActor", async function (document) {
    if (document.type === 'character') {
        document.updateSource({'flags.masks-newgeneration-unofficial.influences': []});
    }
    // Set customType so PbtA resolves sheetType to "call" config
    if (document.type === 'other') {
        document.updateSource({'system.customType': 'call'});
    }
});

// Note: Influence handlers are now in actor-sheet.mjs as part of the V2 sheet implementation.
// The legacy handlers have been removed to prevent duplicate entries.

Hooks.on("renderSettings", (app, html) => {
    // --- Setting Module Configuration
    const MODULE_CONFIG = {
        headingKey: "DISPATCH.Settings.game.heading",
        sectionClass: "masks-doc",
        buttonsData: [
            {
                action: (ev) => {
                    ev.preventDefault();
                    window.open("https://magpiegames.com/masks/", "_blank");
                },
                iconClasses: ["fa-solid", "fa-book"],
                labelKey: "DISPATCH.Settings.game.publisher.title",
            },
            {
                action: (ev) => {
                    ev.preventDefault();
                    window.open("https://github.com/philote/masks-newgeneration-unofficial", "_blank");
                },
                iconClasses: ["fab", "fa-github"],
                labelKey: "DISPATCH.Settings.game.github.title",
            },
            {
                action: (ev) => {
                    ev.preventDefault();
                    window.open("https://ko-fi.com/ephson", "_blank");
                },
                iconClasses: ["fa-solid", "fa-mug-hot"],
                labelKey: "DISPATCH.Settings.game.kofi.title",
            },
        ]
    };

    // --- Button Creation Logic 
    const buttons = MODULE_CONFIG.buttonsData.map(({ action, iconClasses, labelKey }) => {
        const button = document.createElement("button");
        button.type = "button";

        const icon = document.createElement("i");
        icon.classList.add(...iconClasses);

        // Append icon and localized text node
        button.append(icon, document.createTextNode(` ${game.i18n.localize(labelKey)}`));

        button.addEventListener("click", action);
        return button;
    });
    
    // --- Version Specific Logic (Reusable) ---
    if (game.release.generation >= 13) {
        // V13+ Logic: Insert after the "Documentation" section
        const documentationSection = html.querySelector("section.documentation");
        if (documentationSection) {
            // Create section wrapper
            const section = document.createElement("section");
            section.classList.add(MODULE_CONFIG.sectionClass, "flexcol");

            const divider = document.createElement("h4");
            divider.classList.add("divider");
            divider.textContent = game.i18n.localize(MODULE_CONFIG.headingKey);

            // Append divider and buttons to section
            section.append(divider, ...buttons);
            
            // Insert section before documentation
            documentationSection.before(section);
        } else {
            console.warn(`${game.i18n.localize(MODULE_CONFIG.headingKey)} | Could not find 'section.documentation' in V13 settings panel.`);
        }
    } else {
        // V12 Logic: Insert after the "Game Settings" section
        const gameSettingsSection = html[0].querySelector("#settings-game");
        if (gameSettingsSection) {
			const header = document.createElement("h2");
			header.innerText = game.i18n.localize(MODULE_CONFIG.headingKey);

			const settingsDiv = document.createElement("div");
			settingsDiv.append(...buttons);

			// Insert the header and the div containing buttons after the game settings section
			gameSettingsSection.after(header, settingsDiv);
        } else {
            console.warn(`${game.i18n.localize(MODULE_CONFIG.headingKey)} | Could not find '#settings-game' section in V12 settings panel.`);
        }
    }
});

import './influence';
import './team';
import './tools';
import './xcard';
import './advantage';
import './conditions';
import './health';
import './turn-cards';