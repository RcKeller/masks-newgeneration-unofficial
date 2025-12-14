/**
 * Define a set of template paths to pre-load
 */
export const preloadHandlebarsTemplates = async function () {
    return loadTemplates([
      // Main sheet
      'modules/masks-newgeneration-unofficial/dist/templates/sheets/actor-sheet.hbs',
      // Legacy partials (NPC sheet)
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-header.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-attributes.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-movelist.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-social.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-advancement.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/influences-tab-page.hbs',
      // V2 character sheet partials
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-left-panel.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-conditions.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-info-tab.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-powers-tab.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-playbook-tab.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-labels-sidebar.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-move-item.hbs',
      'modules/masks-newgeneration-unofficial/dist/templates/parts/actor-power-card.hbs',
    ]);
};