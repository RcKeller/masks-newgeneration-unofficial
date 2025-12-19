I am running a TTRPG using Masks: A New Generation (Powered by the Apocalypse system). To facilitate this, I have implemented a foundryvtt v13 module (typescript, scss, handlebars) that implements this system as well as a few additional features.

Identify and come up with a plan to address top tech debt areas that have resulted in massive slowdowns when hosting this game with many players.

Refer to the API documents below, perhaps there are better more idiomatic ways to handle events than we currently are?

=========

Hooks
Up to date as of v13

Hooks are an important method by which the core software, systems, and even modules can provide interaction points for other developers.

Official Documentation

Hook Events
Hooks
Note: Not all core hook events are documented by the hook events page, and any system- or module-specific hooks may or may not be documented on that specific package's repository.

Legend

Hooks.on // `.` indicates static method or property
// The Hooks class doesn't use instance methods as it's never instantiated
Overview
Hooks are how Foundry Core exposes certain public API events modules and systems to interact with. It is always recommended to register a callback for an existing hook event instead of monkey patching a core method whenever possible.

Key Concepts
Working with hooks requires keeping in mind the following limitations.

Registration and Execution
There are two sides to the hook architecture: registering a callback and executing registered callbacks (aka triggering a hook).

These aspects are ignorant of eachother. It is not problematic to register a callback for an event which never fires, nor is it problematic to trigger a hook which has no callbacks registered.

Returned Values
Hook callbacks ignore returned values except in cases where the event is triggered with call. If call is used, returning an explicit false will stop the hook event cycle and stop whatever upstream event is occuring (e.g. returning false in preUpdate will stop the update).

Synchronous in nature
Hooks do not await any registered callback that returns a promise before moving on. It is however advisable to use a Promise as a hook callback when the callback you register does not need to block the main process.

Local only
Hooks callbacks only execute on the client triggering that hook. Any core hook that appears to fire on all clients is actually firing on each client individually in response to a socket broadcast from the server. Typically these are related to the Document update cycle.

When creating hooks for a package, it is recommended to rely on the api consumer creating its own socket implemention, rather than broadcasting a socket event which triggers a hook.

Notes about this
A hook callback is executed in the context of the core Hooks class, not in the context the hook was triggered from.

It is expected that all of the data a hook callback will need should be provided in its arguments, rather than expecting this to reference useful data.

API Interactions
The Hooks class works entirely with static methods and is never actually instantiated. Below are coverage of its various static methods.

Registering a Hook callback
There are two ways to register a hook callback with slightly different usecases:

Hooks.on
Used when the callback being registered should run every time the event is triggered.

function someFunction(hookArg1, hookArg2) {
  console.log('hookEvent callback', hookArg1, hookArg2);
}

Hooks.on('hookEvent', someFunction);
Hooks.once
Used if the event might be triggered many times but the callback being registered should only run once.

This is a convience method to make manually calling Hooks.off unecessary for this specific use case.

function oneTimeFunction(hookArg1, hookArg2) {
  console.log('hookEvent callback that should run once', hookArg1, hookArg2);
}

Hooks.once('hookEvent', oneTimeFunction);
Unregistering a Callback
Hooks.off
Used when a particular use case calls for a Hook callback to be executed a specific number of times, or if some other control makes the callback unecessary.

Unregistering a hook callback can be done two ways:

When registering a hook, an ID is provided. Calling Hooks.off and providing this ID will unregister that callback.
Calling Hooks.off and providing a reference to the same function that was registered initially will unregister that callback.
function someFunction(hookArg1, hookArg2) {
  console.log('hookEvent callback that should run once', hookArg1, hookArg2);
}

const hookId = Hooks.on('hookEvent', someFunction);

// later...

Hooks.off('hookEvent', hookId);
// OR
Hooks.off('hookEvent', someFunction); // both ways work
Executing callbacks
It is possible to leverage the Hook API for your own use cases, rather than simply registering callbacks for Core's existing hooks. Doing this is as simple as running call or callAll and providing a unique hook name. Any callbacks registered will fire at that point on the client machine which calls the hook. This is a great way for system developers to allow modules to extend system functionality.

Remember Hooks must be synchronous and cannot await their registered callbacks.

Hooks.call
Calls the registered callbacks in order of registration, stopping when any of them explicitly returns false. This means not all registered callbacks might be called.

Useful for cases where a hook callback should be able to interrupt a process.

function someProcessWithHook(arg) {
  // you can pass any number of additional arguments after the event name
  const canProceed = Hooks.call('myCustomInterruptHook', arg);
  // You may want some kind of error message here more elaborate than the simple `return`
  if (!canProceed) return;

  // do something else
}
Hooks.callAll
Calls the registered callbacks in order of registration, ensuring that all registered callbacks are called.

Useful for cases where a hook callback should not be able to interrupt a process, for example to notify third party scripts that an event has happened and allow them to respond to event.

function someProcessWithHook(arg) {
  Hooks.callAll('myCustomHookEvent', arg);

  // do something else
}
Specific Use Cases
Below are some common patterns working with specific hooks

Render hooks
ApplicationV1
One extremely common use for hooks is the various render hooks, which are triggered by instances of the Application class. Whenever an application is rendered, a hook fires for it and each of its parent classes, e.g. renderActorSheet then renderDocumentSheet then renderFormApplication then renderApplication. Each of these event calls has the same information, the difference is just being able to specify how far up the inheritance tree you want to operate.

All render hooks pass the same three arguments

app: The sheet class instance
html: A jQuery object wrapping the application's rendered HTML
data: The result of the getData operation that was fed into the application's handlebars template
A common usage pattern within these hooks is adding new inputs; by properly assigning the name property, you can have the application's native form handling do the work for you. Remember that you can't just assign arbitrary data to a data model, so you usually have to work with flags to define your additional data.

Hooks.on("renderActorSheet", (app, html, data) => {
  // The value after `??` controls the "default" value for the input
    const myData = app.actor.getFlag("myModule", "myFlag", "myData") ?? "foobar";
  // The `value` sets what shows in the input, and `name` is important for the form submission
  const myInput = `<input type="text" value="${myData}" name="flags.myModule.myFlag">`;
  // the jquery work here may be kinda complicated
  html.find(".some .selector").after(myInput);
})
ApplicationV2
The process described above stays mostly the same for ApplicationV2's render hooks (renderApplicationV2, renderActorSheetV2, and so on). The arguments passed by these hooks are

app: The sheet class instance
element: The root HTMLElement (not a jQuery object) of the rendered application
context: The result of the _prepareContext operation that was fed into the application's handlebars template
options: The application rendering options
The equivalent code would be almost identical:

Hooks.on("renderActorSheetV2", (app, html, context, options) => {
  // The value after `??` controls the "default" value for the input
    const myData = app.actor.getFlag("myModule", "myFlag", "myData") ?? "foobar";
  // The `value` sets what shows in the input, and `name` is important for the form submission
  const myInput = `<input type="text" value="${myData}" name="flags.myModule.myFlag">`;
  // the jquery work here may be kinda complicated
  html.querySelector(".some .selector").insertAdjacentHTML("afterend", myInput);
})
World Initialization
Sometimes fresh worlds need more initialization for proper system functionality than Foundry provides; for example, maybe your game rules need a card deck to properly function. The ready hook is the best place to do this, in conjunction with a simple setting as well as the use of the ui notifications helper

Hooks.once("init", () => {
  game.settings.register('mySystem', 'setupWorld', {
    name: 'Setup World',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  })
});

Hooks.once("ready", () => {
  const isWorldSetup = game.settings.get("mySystem", "setupWorld");
  if (!isWorldSetup && game.users.activeGM?.isSelf) setupWorld()
})

async setupWorld() {
  const warning = ui.notifications.warn("Setting up world, please do not exit the program")
  // do stuff
  await game.settings.set("mySystem", "setupWorld", true)
  ui.notifications.remove(warning)
}
Troubleshooting
Below are some common issues people run into when working with hooks.

What hooks are firing when?
You can use CONFIG.debug.hooks = true in the console to set foundry to be verbose about when hooks are firing and what arguments they provide. It can be useful to have a simple macro to toggle this behavior:

CONFIG.debug.hooks = !CONFIG.debug.hooks
console.warn("Set Hook Debugging to", CONFIG.debug.hooks)
If you already know the name of the hook, you can also use Hooks.once("hookEventNameHere", console.log) to cleanly send the next instance to console to access its properties.

Hooks that fire as part of Foundry's initialization process, such as init, are documented in the Game article.

Object Reference Troubles
Objects (this includes class instances as well as arrays) passed to hooks are passed by reference - any mutations made to them will also be present in the object instances used by the function that called them. If the arguments are re-assigned, that linkage breaks and changes will not be reflected.

By contrast, primitives - strings, numbers, booleans - will NOT see any changes made to them reflected in the original function.

Hooks.on("someEvent", (someObj) => {
  // this change will be present on the original instance
    someObj.someProp = true
  // this breaks the link and further changes will not be reflected
  someObj = { foo: "bar" }
})

==========
Helpers and Utils
Independently useful functions in the Foundry API
Page Contents
Tags
Last edited by
Aioros
07/27/2025
Up to date as of v13

Foundry has a LOT of generally useful functions that are not highlighted in other documentation. This page seeks to organize them

Official documentation

Common Utils
Handlebars Helpers
v12
v13
Custom HTML Elements
Primitive Extensions
Array
Date
Math
Number
Set
String
RegExp
URL
Legend

Array.fromRange // static method
Array#equals // instance method
File paths provided on this page are relative to the yourFoundryInstall\resources\app directory.

Overview
The MDN Javascript Documentation is very thorough and helpful for new developers, but the functions available in Foundry layer provide a mix of implementations of common gaps in the Javascript Language as well as API-specific helpers and utilities.

Key Concepts
The functions covered here are ultimately just shortcuts to things you can implement yourself; it can be very useful to look at the client-side code and see how they're implemented for details and inspiration.

Utils
Key files: common\utils\helpers.mjs, client\core\utils.js (pre-v13 only), client\utils\helpers.mjs (v13+ only).

These methods cover an enormous range of functions available within the Foundry application; some are niche, like benchmark, and others are workhorses that are constantly used, like mergeObject. There's no special requirements to using them; they each serve their own purpose.

Note: The distinction between client and common is that the latter are also used by the Foundry server.

Deprecations
As of v12, global calls to the functions available in Common Utils are deprecated. For future compatibility, use the already-available foundry.utils namespace. The Client Utils are not changing (most importantly: fromUuid, fromUuidSync, and getDocumentClass).

Handlebars Helpers
Key files: client\apps\templates.js (pre-v13 only), client\applications\handlebars.mjs (v13+ only)

Foundry's Applications use handlebars for rendering. To help with this, the core software has provided a number of default "Helpers" which you can reference in your hbs files via {{helper arg1 option1="foo" option2=barVar}}.

You can nest handlebars helpers by using parentheses: {{localize (concat "foo." barVar}}.

You can also invoke the handlebars helpers in your javascript; this is most useful for modules injecting dom elements as part of a render hook. One important note here is that the options properties must be passed inside of a property named hash inside another object, e.g.

let  value = 3
const options: {sign: true}

// Before v13:
HandlebarsHelpers.numberFormat(value, {hash: options}) // returns '+3'

// Since v13:
foundry.applications.handlebars.numberFormat(value, {hash: options}) // returns '+3'
Custom HTML ELements
Key files: client-esm\applications\elements, (pre-v13 only), client\applications\elements (v13+ only)

As a more broadly applicable alternative to Handlebars Helpers, the core Foundry team has started implementing custom HTML elements. These are not tied to the Handlebars rendering engine and are less flexible as a result, but there are many aspects they can replace.

Calling a custom HTML element works just like ordinary browser elements like <div>; they support all of the normal properties like name and class. Most of these are some form of input, so name is especially necessary to work with the native form handling.

<multi-select name="flags.my-module.foobar">
  <option value="foo">Foo</option>
  <option value="bar">Bar</option>
</multi-select>
These custom elements can be combined with handlebars just fine, e.g. using selectOptions to fill in a multi-select. In other contexts, it may be preferable to construct them with Javascript; you can do this with their create static method.

Primitive Extensions
Key files: The common\primitives directory

Rather than just use the common utility functions, Foundry has also directly modified and extended the core Javascript primitives. Javascript does not include Array.fromRange natively, but you can access that static method anywhere in Foundry. These functions can be extraordinarily useful, but at the cost that their presence can confuse and surprise both new and veteran developers alike.

API Interactions
The following section highlights some important utility functions every developer should be familiar with. It is not a comprehensive list; for that, see the documentation at the top of the page.

Global Methods
These methods are generally useful across the foundry API; functions available in foundry.utils are prefaced as such and should be called that way.

fromUuid(uuid) and fromUuidSync(uuid)
Primary article: CompendiumCollection

These functions allow you to grab a pointer to any document. fromUuid is asynchronous and always returns a pointer, while fromUuidSync is synchronous and will only return an index entry if the document is inside a compendium. Both are very useful for tracking down things like a token actor for an unlinked token, since those are nested several layers deep.

foundry.utils.deepClone(object, {strict=false}={})
Ordinarily, javascript passes objects and arrays by reference rather than by value - if you edit that object or array, it will mutate the original. When this is undesired, deepClone can help, with the caveat that deepClone will not help on any advanced data like a Set or another class. This is an important caveat when working with a system that has implemented Data Models for its types: the system property is a class instantiation and so will still be passed by reference if you call deepClone on the parent object.

Another common use for deepClone is while debugging; console.log on an object or array will output a reference to the object, so if updates are performed after the log call then those will be included when you inspect in the console. DeepClone can allow you to properly capture a snapshot.

Keep in mind that this kind of operation can be performance intensive and you should carefully evaluate why you need a fresh object rather than mutating the reference.

foundry.utils.mergeObject(original, other, options)
Foundry makes heavy use of nested object properties, and combining objects is a frequent need. One basic use of mergeObject is updating CONFIG in an init hook.

// Object to add to CONFIG
MYPACKAGE = {}

Hooks.once("init", () => {
    foundry.utils.mergeObject(CONFIG, { MYPACKAGE });
}
foundry.utils.fetchJsonWithTimeout
This function retrieves a JSON file and parses it. While you should generally use a Compendium Pack for storing data in foundry as documents, sometimes it's necessary to store data outside of the document system. Note that this method ultimately uses the core fetch function, wrapped in protective promises.

It can also be useful in creating compendium packs; if you have a large amount of creation data, you can use a macro and this helper function to programatically fill in your packs.

foundry.utils.isNewerVersion(v1, v0)
This method is helpful when attempting to provide multi-version compatibility across core software and system updates. This supports both strings and numbers and is written with semantic versioning in mind.

The most common targets for v1 are game.version and game.system.version for the core software and system versions respectively. It's important to check if a game system uses a leading v in their versioning definition so your comparisons can be accurate.

getDocumentClass(documentName)
This is the canonical way to find the correct class for a document after configuration has happened.

Handlebars Helpers
Foundry's helpers augment the built-in helpers. In addition to the helpers highlighted below, there's a number of other input helpers like numberInput, rangeInput, etc. that can simplify your rendering logic.

localize
Primary article: Localization

The localize helper represents two different functions; game.i18n.localize and game.i18n.format. If you only pass a single argument, localize is called and it's a simple translation. If you pass additional arguments, they get fed into format.

<!-- Returns "Actor" -->
{{localize "DOCUMENT.Actor"}}

<!-- Returns "Create New Actor" -->
{{localize "DOCUMENT.Create" type="Actor"}}
selectOptions
The selectOptions Handlebars helper is provided by Foundry for more easily building the list of options in a select element. This is typically used in actor and item sheets, for offering the selection of one option among multiple. It can also be used in a multi-select element for choosing multiple options.

The helper takes an object of values and labels (either labels to use as-is or localization strings) and generates the proper sequence of <option> HTML elements for them.

The appropriate object for the options is often defined as a constant in the system, but can also be generated dynamically if needed. The object of choices gets passed into the template in the getData function of the application.

Undocumented Helpers
The following helpers are not emitted to the foundry API page, but are nevertheless very useful:

<!-- Turns a timestamp into a relative string. -->
<!-- The input can be a Date or string -->
{{timeSince timeStamp}}

<!-- The following helpers return a boolean -->
<!-- They should be used inside an #if or #unless -->
<!-- As such they are presented to be nested, with ( ) instead of {{ }} -->

<!-- Returns v1 === 2 -->
(eq v1 v2)

<!-- Returns v1 !== 2 -->
(ne v1 v2)

<!-- Returns v1 < 2 -->
(lt v1 v2)

<!-- Returns v1 > 2 -->
(gt v1 v2)

<!-- Returns v1 <= 2 -->
(lte v1 v2)

<!-- Returns v1 >= 2 -->
(gte v1 v2)

<!-- Returns !pred -->
(not pred)

<!-- Returns true if every argument is truthy  -->
(and arg1 arg2 arg3 ...)

<!-- Returns true if any argument is truthy -->
(or arg1 arg2 arg3 ...)
One warning with these: Your primary application logic should still be occuring within getData/_prepareContext, you should use these only sparingly.

Primitive Extensions
Stub
This section is a stub, you can help by contributing to it.

Notifications
API Documentation: Notifications

Foundry has a "toasts" system available at ui.notifications. Its methods, info, warn, and error all call notify, which creates the toast then returns the ID of the notification. In some instances, you may wish to capture this ID for use with remove to programatically dismiss a toast. Notifications take an optional second argument where you can pass { localize: true } so any warnings you add are i18n-friendly.

Specific Use Cases
The following are walkthroughs of more complicated helpers or utils in the context of an overall package implementation.

SelectOptions Example
This worked example assumes you're using the Boilerplate system development template or some other structure in which you have a config.mjs file for your system's constants and use context as the object that getData returns.

There are multiple files where the various choices get handled to get them into the proper context to feed into the template's context. They're all simple things that logically fit in those files, but it does involve multiple files to place the data in the right spots. The material listed isn't the entire content of the files/methods involved, but it should be enough of the significant context to make the usage clear.

Localization file (for situations where you're localizing the labels)
This defines the label strings that actually show up in the dropdown itself.

lang/en.json

{
    "MYMODULE.choices": {
        "first": "First choice",
        "second": "Second choice",
        "third": "Third choice"
    }
}
config.mjs (the config file where system constants are defined)
This defines the internal value list and points at the appropriate translation strings from the localization file.

module/helpers/config.mjs

export const MYMODULE = {};

MYMODULE.dropdownChoices = {
    "alpha": "MYMODULE.choices.first",
    "bravo": "MYMODULE.choices.second",
    "charlie": "MYMODULE.choices.third",
};
Primary JS file for package (listed in your manfiest file's esmodules)
This code adds the constants object to Foundry's overall CONFIG scope for later use wherever you need it. If you're using Boilerplate, it should be set up in this way already.

import {MYMODULE} from "./helpers/config.mjs";

Hooks.once('init', () => {
    CONFIG.MYMODULE = MYMODULE;
});
The Application subclass rendering the dropdown
This code goes in the getData of the Application in question (typically an ActorSheet or ItemSheet, but the technique for using a selectOptions is the same regardless of what kind of Application is being rendered).

getData() {
    const context = super.getData();
    context.optionObj = CONFIG.MYMODULE.dropdownChoices;
    return context
}
The template Handlebars file for the application
This is where the selectOptions Handlebars helper actually gets used. It is taking the optionObj from the Handlebars rendering context, a selected argument with the current value (so that it can have the dropdown initially showing that choice), and an argument indicating that localization should be performed. The <select name="system.mychoice"> uses the name="" to determine where in the data the value should be saved to (assuming the typical use-case of this defining a dropdown for an ActorSheet/ItemSheet or something similar).

<select name="system.mychoice">
    {{selectOptions optionObj selected=system.mychoice localize=true}}
</select>
Output
The final HTML generated will be this (assuming the initial value of system.mychoice is bravo, for illustrative purposes). It will save alpha, bravo, or charlie as a string to the document's data in the appropriate spot (if used in a DocumentSheet that has a document to save things to; tweak your name="" and such as-needed for other usages).

HTML

<select name="system.mychoice">
    <option value="alpha">First Choice</option>
    <option value="bravo" selected>Second Choice</option>
    <option value="charlie">Third Choice</option>
</select>
Output


Second Choice
Conclusion
Ultimately, the selectOptions helper has the potential to significantly simplify using standardized and localized choices from an object of options. It is possible to define a similar HTML structure manually or through Handlebars {{#each}} loops and such, but it's a lot more prone to mistakes than using the helper designed to do it for you.

SignedString // NumberFormat
You can display signed number that's editable as a number by combining input type='text', data-dtype='Number', and Number#signedString() or {{numberFormat value sign=true}}.

A number input cannot display "+5", but a text input can.
data-dtype='Number' is a special property in Foundry that will cast the input from a string to a number as a FormApplication is submitted. (FormDataExtended##castType)
Either in your getData you can use Number#signedString() to derive the display value, or you can use the numberFormat helper with sign=true; it depends on how exactly you've structured your data which is better.
<!-- The name and value attributes will depend on your getData and form object -->
<input
    type='text'
    data-dtype='Number'
    name='system.attribute.mod'
    value={{numberFormat system.attribute.mod sign=true}}
/>
Branching Core Software Version Logic
Supporting multiple versions of Foundry in the same codebase can be tricky when there's breaking API changes. One way to address this is foundry.utils.isNewerVersion. You can always pair this with the core software compatibility controls in module.json or system.json

// `Game#release.generation` returns just the major version number, e.g. 11
const isV11 = foundry.utils.isNewerVersion(12, game.release.generation)

// `Game#version` returns the full version string, e.g. 11.315
const isV12dev2 = !foundry.utils.isNewerVersion("12.319", game.version)

// You also don't *have* to use the helper function when you just need the major version
const isV12 = game.release.generation >= 12
Checking Inheritance
Sometimes it's necessary to check the inheritance chain. There's many ways to do this:

With Documents: If you just need to check the type of a document, the documentName getter will return a string like "Actor". This is available as both an instance and static method - Actor.documentName as well as actor.documentName.

With other classes: If you have a class Foo to evaluate against OtherClass, you can use foundry.utils.isSubclass(foo, OtherClass). If you have an instance foo, you can use foo instanceof OtherClass.

formInput and formGroup
API Reference

formInput and formGroup
v12
v13
FormInputConfig
v12
v13
FormGroupConfig
v12
v13
Note: The formField helper is an alias for formGroup, they call the same HTML generation functions

The formInput and formGroup helpers can programatically generate appropriate fields from their data model implementation. This means text inputs for StringField, number inputs for NumberField, and even generating select inputs for fields with configured choices. However, using these helpers can be confusing for nested structures, even if they otherwise simplify sheet templating. For them to work properly, you must have implemented a Data Model for the document subtype. Remember that these are just helpers and are in no ways mandatory.

Basic handlebars usage:

// Sample handlebars
{{formInput fields.name value=document.name localize=true}}
{{formGroup systemFields.myField value=system.myField localize=true}}
Alongside the corresponding getData/_prepareContext:

context.document = this.document;
context.fields = this.document.schema.fields;
context.system = this.document.system;
context.systemFields = this.document.system.schema.fields;
// If you just need one specific field, in this case `img`
context.imgField = this.document.schema.getField("img");
context.img = this.documeng.img;
return context;
The primary difference between the two is that formGroup will render a label and hint alongside the raw input.

The main argument, fields, takes a pointer to the actual DataField instance it's rendering
Your getData or _prepareContext needs to provide this.document.schema.fields for base document properties (e.g. Actor#name).
However, this pointer won't be able to traverse any nested data model instances, such as the system field; you'll need to provide a separate pointer, e.g. context.systemFields = this.document.system.schema.fields.
For formGroup, the field will add a label and/or a hint if the corresponding property is present in your localisation file (e.g. en.json). You can automatically assign these with the LOCALIZATION_PREFIXES static property. If the label is not present, room will be left for it, but the space will be blank.
Traversing a nested structure of SchemaField requires alternating with the fields property; a simple path to system.details.biography.value turns into systemFields.details.fields.biography.fields.value
Similar complications arise if you use the EmbeddedDataField class - it may be simpler in those cases to just use normal input creation.
formInput optional arguments are an instance of FormInputConfig
formGroup optional arguments are a union of FormInputConfig and FormGroupConfig
One example of their implementation is the UserConfig application, available at client\applications\sheets\user-config.mjs (client-esm\applications\sheets\user-config.mjs in v12) and its template templates\sheets\user-config.hbs

The widget option
One way to offload HTML construction from the Handlebars template to a javascript function is the widget option, which takes a function with the signature (FormGroupConfig, FormInputConfig) => HTMLDivElement*. This is only available to the formGroup helper, not formInput, and its actual utility as compared to defining the structure in the template directly depends on the complxity of the application.

*The function could technically return any HTML element with a valid outerHTML property, not just a div.

Defining your own Handlebars Helper
Stub
This section is a stub, you can help by contributing to it.

function prepareFormRendering(doc,path,options) {
  let field: foundry.data.fields.DataField;
  if (path.startsWith('system')) {
    const splitPath = path.split('.');
    splitPath.shift();
    field = doc.system.schema.getField(splitPath.join('.'));
  } else {
    field = doc.schema.getField(path);
  }
  const { classes, label,  hint, rootId, stacked, units, widget, source, ...inputConfig } = options.hash;
  const groupConfig = {
    label,
    hint,
    rootId,
    stacked,
    widget,
    localize: inputConfig.localize,
    units,
    classes: typeof classes === 'string' ? classes.split(' ') : [],
  };
  if (!('value' in inputConfig)) {
    inputConfig.value = foundry.utils.getProperty(
      source ? doc._source : doc,
      path,
    );
  }
  return { field, inputConfig, groupConfig };
}

function formGroupSimple(doc, path, options) {
  const { field, inputConfig, groupConfig } = prepareFormRendering(doc, path, options);
  const group = field.toFormGroup(groupConfig, inputConfig);
  return new Handlebars.SafeString(group.outerHTML);
}

function formInputSimple(doc, path, options) {
  const { field, inputConfig } = prepareFormRendering(doc, path, options);
  const group = field.toInput(inputConfig);
  return new Handlebars.SafeString(group.outerHTML);
}
{{formGroupSimple doc 'system.builder.cost' localize=true}}
Troubleshooting
Here are some common problems when interacting with these utility functions.

Editor Height
The editor helper does not have a native height, so if it's not contained in an external div it will collapse to 0. CSS classes can help here, but keep in mind the default class of the created div is editor.


=============

Sockets
Up to date as of v13

Sockets provide a way for different clients connected to the same server to communicate with each other. This page covers both directly using game.socket as well as the v13 feature of interacting via registering queries.

Official Documentation

Socket
SocketInterface
Legend

SocketInterface.dispatch // `.` indicates static method or property
Socket#on // `#` indicates instance method or property
Overview
Foundry Core uses socket.io v4 behind the scenes for its websocket connections between Server and Client. It exposes the active socket.io connection directly on game.socket, allowing packages to emit and respond to events they create. As such, most of the socket.io documentation is directly applicable to foundry's usage.

Alternatively, one can register functions in CONFIG.queries, providing predefined handlers for inter-client communication. Foundry includes two queries by default; dialog and confirmTeleportToken; the former of these is especially versatile and obviates many previous needs for sockets.

This is useful in cases where a package wants to send information or events to other connected clients directly without piggybacking on some other Document operation, such as creating a chat message or an update to an item.

Key Concepts
For the purposes of this article, using game.socket will be referred to as direct sockets. Registering functions in CONFIG.queries will instead be reffered to as the query system.

Socket Data
Socket data must be JSON serializable; that is to say, it must consist only of values valid in a JSON file. Complex data structures such as a Data Model instance or even Sets must be transformed back to simpler forms; also keep in mind that if possible you should keep the data in the transfer as minimal as possible. If you need to reference a document, just send the UUID rather than all of its data, as the other client can just fetch from the UUID.

Direct Sockets vs. Queries
By default, direct sockets are emitted to every client, and it is the responsibility of the handler to perform any necessary filtering. By contrast, queries are always targeted, from one user to another, and so any mass-message system will need to call query each user separately. The upside is that each of those queries is its own promise that is fully and properly awaited for response by the queried user, unlike direct sockets which only returns a promise that confirms receipt by the server.

It's also worth noting that direct sockets do not have any built-in permission controls, while queries have the QUERY_USER permission which is available to all players by default but can be taken away by stricter GMs.

API Interactions
These are common ways to interact with the Foundry socket framework.

Direct Socket Prerequisities
Before a package can directly send and receive socket events, it must request a socket namespace from the server. This is done by putting "socket": true in the manifest json.

All socket messages from a package must be emitted with the event name module.{module-name} or system.{system-id} (e.g. module.my-cool-module).

Query Registration
Registering a query is as simple as adding a new entry to CONFIG.queries. The key should be prefixed by your package ID, e.g. my-module.someEvent. Your function must return JSON-serializable data, as whatever it returns will be passed back to the querying client.

async someEventHandler(queryData, {timeout}) {
    // do stuff
  return jsonData;
}

CONFIG.queries["my-module.someEvent"] = someEventHandler;
The first argument, queryData, is whatever JSON-serializable info you want to provide to the queried client. The second argument, queryOptions, currently only may have timeout information. It is destructured in every usage, so you can't use it to pass any futher arbitrary options; the correct spot for community developers to add more info is into that queryData object.

Using Queries
Invoking a query involves using the User#query method.

// Your business logic will determine how to pick the user to query
// The activeGM is a common choice for delegating permission-intensive actions
const user = game.users.activeGM;

// Your business logic will also dictate what you need to include in the payload
// to deliver to the other client
const queryData = { foo: "bar" };

// timeout is optional and is in *milliseconds*.
// Inline multiplication is an easy way to make sure your intended duration is more readable.
const queryValue = await user.query("my-module.someEvent", queryData, { timeout: 30 * 1000 });

// Now queryValue will be the return of whatever function you ran, if relevant.
Simple emission of a direct socket event
Note that this socket event does not get broadcast to the emitting client.

socket.emit('module.my-module', 'foo', 'bar', 'bat');
Listen to a socket event
All connected clients other than the emitting client will get an event broadcast of the same name with the arguments from the emission.

socket.on('module.my-module', (arg1, arg2, arg3) => {
  console.log(arg1, arg2, arg3); // expected: "foo bar bat"
})
Promise wrapped emission of a socket event
It can be useful to know when a socket event was processed by the server. This can be accomplished by wrapping the emit call in a Promise which is resolved by the acknowledgement callback.

new Promise(resolve => {
  // This is the acknowledgement callback
  const ackCb = response => {
    resolve(response);
  };

  socket.emit('module.my-module', arguments, ackCb);
});
The arguments of the acknowledgement callback are the same arguments that all other connected clients would get from the broadcast. Note that this is not the same as being able to fully await any actions taken on the other clients - you would need a second socket event, sent by the other clients, to handle that.

Specific Use Cases
Here are some helpful tips and tricks when working with sockets.

Handling many kinds of events from one package
Since packages are only allotted one event name, using an pattern which employs an object as the socket event with a type and payload format can help overcome this limitation.

socket.emit('module.my-module', {
  type: 'ACTION',
  payload: 'Foo'
});
function handleAction(arg) {
  console.log(arg); // expected 'Foo'
}

function handleSocketEvent({ type, payload }) {
  switch (type) {
    case "ACTION":
      handleAction(payload);
      break;
    default:
      throw new Error('unknown type');
  }
}

socket.on('module.my-module', handleSocketEvent);
Using a helper class
You can encapsulate this strategy by defining a helper class; the following example is inspired by SwadeSocketHandler:

class MyPackageSocketHandler {
    constructor() {
    this.identifier = "module.my-module" // whatever event name is correct for your package
    this.registerSocketListeners()
  }

  registerSocketHandlers() {
    game.socket.on(this.identifier, ({ type, payload }) => {
      switch (type) {
        case "ACTION":
          this.#handleAction(payload);
          break;
        default:
          throw new Error('unknown type');
      }
    }
  }

  emit(type, payload) {
    return game.socket.emit(this.identifier, { type, payload })
  }

  #handleAction(arg) {
    console.log(arg);
  }
}
This helper class is then instantiated as part of the init hook:

Hooks.once("init", () => {
  const myPackage = game.modules.get("my-module") // or just game.system if you're a system
  myPackage.socketHandler = new MyPackageSocketHandler()
});

// Emitting events works like this
game.modules.get("myPackage").socketHandler.emit("ACTION", "foo")
Pretend the Emitter was called
The expectation is to be able to call whatever method locally at the time of socket emission in addition to calling it in response to a broadcast.

// called by both the socket listener and emitter
function handleEvent(arg) {
  console.log(arg);
}

// not triggered when this client does the emit
socket.on('module.my-module', handleEvent);


function emitEventToAll() {
  const arg = 'foo';

  socket.emit('module.my-module', arg);

  handleEvent(arg);
}
Socket#emitWithAck: This method, despite being available as of v11, does not appear to be useful in the context of Foundry because the server acts as a middle-man for all socket events.

Handling the event on the emitter
socketlib has a handy abstraction for this pattern.

Doing something on one GM client (aka. GM Proxy)
This is a common way to get around permission issues when player clients want to interact with Documents they do not typically have permission to modify (e.g. deducting the health of a monster after an attack).

function handleEvent(arg) {
  if (game.user !== game.users.activeGM) return;

  // do something
  console.log(arg);
}

socket.on('module.my-module', handleEvent);
socketlib has a handy abstraction for this pattern. This snippet is derived from its solution.

Doing something on one specific client
Some applications require a specific user to be targeted. This cannot be accomplished by the emit call and instead must happen in the handler.

Emitter:

socket.emit('module.my-module', {
  targetUserId: 'some-user-id',
  payload: "Foo"
})
Socket Handler:

function handleEvent({ targetUserId, payload }) {
  if (!!targetUserId && game.userId !== targetUserId) return;

  // do something
  console.log(payload);
}

socket.on('module.my-module', handleEvent);
socketlib has a handy abstraction for this pattern.

Troubleshooting
No socket event is broadcast
Run through this checklist of common issues:

Does your manifest include the "socket": true property mentioned in the Prerequisites?
Have you restarted the world since modifying the manifest JSON?
Are you broadcasting with the correct namespace on your event? (Also mentioned in the Prerequisites section)
Are you trying to respond to the broadcast from the emitting client? (Emitters do not recieve the broadcast, some strategies above for handling this.)
Architectural Notes
The following information comes directly from Atropos on the Mothership Discord's dev-support channel. [Link]

We use a pattern for the socket workflow that differentiates between the initial requester who receives an acknowledgement and all other connected clients who receive a broadcast.

This differentiation allows us to have handling on the initial requester side that can enclose the entire transaction into a single Promise. The basic pattern looks like this:

On the Server Side

socket.on(eventName, (request, ack) => {
  const response = doSomethingWithRequest(request) // Construct an object to send as a response
  ack(response); // This acknowledges completion of the task, sent back to the requesting client
  socket.broadcast.emit(eventName, response);
});
For the Requesting Client

new Promise(resolve => {
  socket.emit(eventName, request, response => {
    doSomethingWithResponse(response); // This is the acknowledgement function
    resolve(response); // We can resolve the entire operation once acknowledged
  });
});
For all other Clients

socket.on(eventName, response => {
  doSomethingWithResponse(response);  // Other clients only react to the broadcast
});
Note in my example that both the requesting client and all other clients both doSomethingWithResponse(response), but for the requesting client that work happens inside the acknowledgement which allows the entire transaction to be encapsulated inside a single Promise.


===============

Flag
Up to date as of v12

Flags are a generalized way for documents to store additional information as needed by systems and modules.

Official Documentation

Document#setFlag
Legend

Document.defineSchema // `.` indicates static method or property
Document#setFlag // `#` indicates instance method or property
Overview
Flags are the safest way that packages can store arbitrary data on existing documents. If a package allows the user to set some data which isn't normally on the Document's data schema, it should leverage flags.

Systems and modules can define unique pairings of type field values and system using Data Models for many document classes. This provides significantly greater control over the data validation process. However, if you need to modify a document subtype another package defined, e.g. a module providing additional properties to a "weapon" item implemented by the system, then use flags rather than try to monkey patch the data schema defined by the system.
Documents with configurable types include ActiveEffect, Actor, Card, Cards, ChatMessage, Combat, Combatant, Item, and JournalEntryPage

A flag does not have to be a specific type, anything which can be JSON.stringifyed is valid.

Key Concepts
Below are important things to always consider when working flags.

Data Format
Flags live on the root of a Document's properties, on the same level as name.

Document
├─ id
├─ parent
├─ name
├─ flags <---
└─ someOtherSchemaKey (e.g. `system`)
The flags object is keyed by scope then flag name as seen in setFlag.

flags: {
  <scope>: {
    <flag name>: value
  }
}
API Interactions
These are the most common ways developers interact with flags.

Setting a flag's value
Flags are automatically namespaced within the first parameter given to Document#setFlag.

The following are expected scopes:

core
world
The id of the world's system.
The id of a module present in game.modules - Note that this does not need to be an active module.
If an unexpected scope is provided, Foundry core will throw an error.

const newFlagValue = 'foo';

someDocument.setFlag('myModuleName', 'myFlagName', newFlagValue);
There are some caveats and pitfalls to be aware of when interacting with objects stored in flags.

See Some Details about setFlag and objects below for more information.

Without setFlag
While setFlag is the easiest and generally best way to update the flags field, it's not the only way.

As part of a Document Update
Manually updating a Document's flags value does not have any of the client-side validations that setFlag has.

For instance, nothing prevents an update from directly replacing the namespaced flags object with a direct record of keys and values.

Be careful when interacting with flags manually to keep this structure lest you accidentally break someone else's package (or they yours).

Changing a flag value during a normal document update is a way to set multiple flags at once, or to both update the flag and standard schema data at the same time.

To do so, the data fed to the Document#update method should target the specific namespaced object and flag name being edited.

const updateData = {
  ['flags.myModuleName.myFlagName']: newFlagValue,
};

// is the same as

const updateData = {
  flags: {
    myModuleName: {
      myFlagName: newFlagValue
    }
  }
}

someDocument.update(updateData);
Mutation
Simply mutating a flag's value on a document's data with = assignment will not persist that change in the database, nor broadcast that change to other connected clients. Keep this in mind when editing a document during a hook that fires in prepareData.

Getting a flag's value
There are two main ways to get a flag value: Following the chain of sub-fields, or with Document#getFlag

The arguments passed to getFlag have the same constraints as those passed to setFlag. Providing an unexpected scope will throw rather than return undefined. If you need a flag from a module which might not exist in the world, it is safer to access it on the data model itself.

const flagValue = someDocument.getFlag('myModuleName', 'myFlagName');
// flagValue === 'foo'
Chaining sub-fields
Flags are readable on the Document's data as detailed in the Data Format section:

someDocument.flags.packageId.flagKey
Keep in mind that accessing deeply properties in javascript requires the optional chaining operator, ?., to avoid throwing errors if one of the properties in the path doesn't exist. Secondly, if any of the properties along the way is hyphenated, e.g. package-id, you'll have to use brackets and a string access, e.g. flags["package-id"].flagKey. The getFlag method already handles these conditions which is why it's usually preferable to use it in place of ordinary javascript property chaining.

Unset a flag
A safe way to delete your flag's value is with Document#unsetFlag. This will fully delete that key from your module's flags on the provided document.

someDocument.unsetFlag('myModuleName', 'myFlagName');
This is semantically equivalent to the following call, just missing some additional protections checking the scope.

someDocument.update({'flags.myModuleName.-=myFlagName': null})
Specific Use Cases
Check for a flag during a Hook
Since flags are simply data on a Document, any hook that fires during that document's event cycle and most other hooks involving the document will have access to that data.

For example, a flag on ChatMessage might be injected into the DOM for that message.

chatMessage.setFlag('myModule', 'emoji', '❤️');

Hooks.on('renderChatMessage', (message, html) => {
  if (message.getFlag('myModule', 'emoji')) {
    html.append(`<p>${message.flags.myModule.emoji}</p>`);
  }
});
Some Details about setFlag and objects
When the value being set is an object, the API doesn't replace the object with the value provided, instead it merges the update in. Document#setFlag is a very thin wrapper around Document#update.

The database operation that update eventually calls is configured by default to update objects with mergeObject's default arguments.

Example to demonstrate:

game.user.setFlag('world', 'todos', { foo: 'bar', zip: 'zap' });
// flag value: { foo: 'bar', zip: 'zap' }

game.user.setFlag('world', 'todos', {});
// flag value: { foo: 'bar', zip: 'zap' }
// no change because update was empty

game.user.setFlag('world', 'todos', { zip: 'zop' });
// flag value: { foo: 'bar', zip: 'zop' }
Document#setFlag should perhaps be thought about as "updateFlag" instead, but that's only partly true because it can set that which doesn't exist yet.

Where this has the most effect is when one wants to store data as an object, and wants to be able to delete individual keys on that object.

The initial instinct of "I'll setFlag with an object that has everything but that key which was deleted," does not work. There are some options available, some more intuitive than others.

Foundry Specific key deletion syntax
This is the recommended way to use setFlag to delete a key within a flag object.

The foundry-specific syntax for deleting keys in Document#update (-=key: null) works with setFlag as well:

game.user.setFlag('world', 'todos', { ['-=foo']: null });
// flag value: { zip: 'zop' }
Hijacking Document#unsetFlag
The unsetFlag method is a thin wrapper around Document#update which first modifies the key being updated to use the Foundry Specific key deletion syntax (-=key: null).

This means unsetFlag could be used in a roundabout way to remove a specific key within a flag's object:

game.user.unsetFlag('world', 'todos.foo');
// flag value: { zip: 'zop' }
Setting to null
If you're happy with the key being null, setting a key's value to null explicitly works as expected:

game.user.setFlag('world', 'todos', { foo: null });
// flag value: { foo: null, zip: 'zop' }
Troubleshooting
Invalid Scope for flag
This error is thrown when the first argument to Document#setFlag (or unsetFlag/getFlag) mentions a package which is not installed.

Typically this is due to a typo.

This is commonly encountered in use cases where one module checks another module's data and operates based on that data and can be sneaky as a deactivated module does not trigger it.


=============

