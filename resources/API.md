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

----------------
Hooks
API documentation for interacting with and creating Hooks
Page Contents
Tags
Last edited by
Stefano Morciano
07/26/2025
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

----------------

Settings
Provide user configuration for your package
Page Contents
Tags
Last edited by
Aioros
07/27/2025
Settings
Up to date as of v13

Settings are a general way for packages to persist and store data without being attached to a document.

Official Documentation

ClientSettings
WorldSettings
Setting
SettingsConfig
Legend

Setting.defineSchema // `.` indicates static method or property
ClientSettings#register // `#` indicates instance method or property
game.settings.register // The ClientSettings class is instantiated as part of the `game` object
Overview
Settings, like flags, are a way for packages to store and persist data. Unlike flags, Settings are not tied to a specific document.

For the vast majority of use-cases, settings are intended to be modified by a UI, either a Menu or within the Module Settings panel itself. These settings are intended to be used to modify the functionality of a package, rather than store arbitrary data for that module or system.

Key Concepts
The following elements are crucial to understanding settings.

Scope
Settings have a scope field which indicates if it's part of the device's localStorage (scope: client) or if it should be stored in the world's database (scope: world). Starting in v13, scope: user is also available, storing the setting value for the specific User across any devices they might use.

If you are on a version older than v13 and you wish to store data specific to a user, consider instead storing the data as a flag on the user document. Alternatively, store the data as part of an object in the setting.

Permissions
Client settings are always editable by any user, as they are device-specific. This works well for display-based settings.

World settings have a global permission level ("Modify Configuration Settings") that is shared with the ability to enable or disable modules. By default, only Assistant GMs and Game Masters can edit world settings. This is a critical limitation that may require sockets to work around.

API Interactions
The ClientSettings are a singleton class instantiated as part of the game object.

Registering a Setting
See Setting Types below for examples about the different types of settings that can be registered.

Settings should be registered during the init hook.

All settings must be registered before they can be set or accessed. This needs to be done with game.settings.register, with game.settings being an instance of ClientSettings.

/*
 * Create a custom config setting
 */
game.settings.register('myModuleName', 'mySettingName', {
  name: 'My Setting',
  hint: 'A description of the registered setting and its behavior.',
  scope: 'world',     // "world" = sync to db, "client" = local storage
  config: true,       // false if you dont want it to show in module config
  type: Number,       // You want the primitive class, e.g. Number, not the name of the class as a string
  default: 0,
  onChange: value => { // value is the new value of the setting
    console.log(value)
  },
  requiresReload: true, // true if you want to prompt the user to reload
  /** Creates a select dropdown */
  choices: {
        1: "Option Label 1",
    2: "Option Label 2",
    3: "Option Label 3"
    },
  /** Number settings can have a range slider, with an optional step property */
  range: {
    min: 0,
    step: 2,
    max: 10
  },
  /** "audio", "image", "video", "imagevideo", "folder", "font", "graphics", "text", or "any" */
  filePicker: "any"
});
Some registration notes
name and hint, and the labels in choices are localized by the setting configuration application on render, so you can register settings in init and just pass a localizable string for those values
config defaults to undefined which behaves the same as false
requiresReload is useful for settings that make changes during the init or setup hooks.
scope defaults to "client"
You can pass a data model or data field as the type for complex settings that need data validation.
filePicker restricts what kinds of files can be chosen for the setting
Setting Types
The type of a setting is expected to be a constructor which is used when the setting's value is gotten. The 'normal' primitive constructors cover all basic use cases:

String
Number
Boolean - turns the setting into a checkbox
Array
You can use fundamental language constructs as types

Object
Function
There's also some lesser used primitive types that are nevertheless eligible

Symbol
BigInt
It is possible however to leverage this functionality to do some advanced data manipulation with a complex setting object during the get. Doing so has some gotchas surrounding the onChange callback.

class SomeClass {
  constructor(parsedJson) {
    this.merged = parsedJson?.foo + parsedJson?.bar;
    this.foo = parsedJson?.foo;
    this.bar = parsedJson?.bar;
  }
}

game.settings.register('myModuleName', 'customClassSetting', { type: SomeClass });

game.settings.set('myModuleName', 'customClassSetting', {foo: 'foosius', bar: 'whatever'});

game.settings.get('myModuleName', 'customClassSetting').merged; // 'foosiuswhatever'
As an even more advanced use case, you could pass a DataModel as a setting to provide advanced validation; the type casting has a special case from these where it calls YourDataModel.fromSource.

Localization
When registering a setting, instead of passing a hard-coded string to name or hint, it is possible to pass a localization path to support translations. Both name and hint are run through game.i18n.localize before being displayed in the Setting UI.

Setting a Setting's value
Settings with scope: world cannot be set until the ready hook.

A setting's value can be set with game.settings.set. It's important to note that a scope: world setting can only be set by a user with the "Modify Configuration Settings" permission (by default this is only Game Master and Assistant GM users), while scope: client settings will only persist on the user's local machine.

const whateverValue = 'foo';

game.settings.set('myModuleName','myModuleSetting', whateverValue);
Acceptable Values
Easily handled data:

Objects and Arrays which do not contain functions
Strings
Numbers
Booleans
A setting's value is stringified and stored as a string. This limits the possible values for a setting to anything which can survive a JSON.stringify() and subsequent JSON.parse().

Note that JSON.stringify will prefer to use a value's toJSON() method if one is available, all Foundry documents have such a method which strips the document back to its base data.

Type Constraints
If you wish to improve validation when updating a complex setting, you should consider a data model or data field. If you're just using String or Number, it will run the new value through those primitives first before storing to the database (e.g. if the setting is type: Number, and someone passes set(scope, key, "5"), the setting will run Number("5") to cast the type). StringField and NumberField will accomplish similar casting behavior but also allow further refinements, such as whether a blank string is allowed or whether to enforce that the number is an integer.

Getting a Setting's value
Settings can be read with game.settings.get.

const someVariable = game.settings.get('myModuleName','myModuleSetting');

console.log(someVariable); // expected to be 'foo'
Setting Defaults
Unless a setting has actively been saved to the world database with a call to game.settings.set, it will fill in with the registered default. This means that if you update the default, it will automatically apply to not only new users but also current ones. This can be useful, but also means that you can't rely on a setting's value to detect "old" users in the caes of a setting that is tracking things like previous module versions if you aren't actively creating a database entry.

One way to check if there's a database-backed value is to call game.settings.storage.get("world").getSetting, which accesses the actual world collection of setting documents (comparable to game.actors). If that returns undefined, there's no underlying DB entry for the setting and it's just going to use the default. Note that the key is the concatenated namespace and settingName, e.g. core.compendiumConfiguration.

Returned Value Type
When getting a setting's value, the type of the setting registered is used by Core as a constructor for the returned value.

Example:

game.settings.register('myModuleName', 'myNumber', { type: Number });

game.settings.set('myModuleName', 'myNumber', 'some string');

game.settings.get('myModuleName', 'myNumber'); // NaN
For more information on the basic primitive constructors and how they convert values, this article has a good overview.

Registered Settings vs. World Database
On the backend, Settings are fairly simple documents; they have an _id, key, value, and _stats field. They are the only document type to not have a flags field. Unlike every other primary document, their world collection is not a property of the Game class directly; instead, game.settings accesses the singleton instance of ClientSettings, which then has the actual WorldSettings instance as a sub-property. This is in part because there are actually two places to store settings; WorldSettings is shared database, but localStorage provides per-client settings separate from Foundry's normal document-based DB operations.

Where settings registration comes in is providing safeguards for the returned values

The get and set operations check if a setting has been registered
If a setting is registered, then the type gets used to cast the JSON stringified value of the Setting document, which is returned by the get operation
The other pieces of the registration are used by the SettingsConfig application for config: true; if you provide a DataField instance for the type, it will call that field's toInput function, and then appropriately label with the name and hint properties.

Specific Use Cases
Here are some tips and tricks for working with settings.

Reacting to Setting Changes
There is no hook for when a setting changes, instead an onChange callback must be provided during registration (You of course could run Hooks.call() in that callback). This callback is fired after the setting has been set, meaning a settings.get inside this callback will return the new value of the setting, not the old.

The onChange callback does not fire if there are no differences between the value being set and the current value returned from settings.get.

This callback will fire on all clients for world scoped settings, but only locally for client scoped settings. Its only argument is the raw value of the setting that was set.

Because this value argument is not necessarily the same value that would be returned from settings.get, it is safer to get the new value in this callback if you intend to operate on it.

Setting Registration Examples
This section will provide snippets and screenshots for the various common setting configurations. These snippets have the minimum number of options required to display the setting and may require tweaking for your specific use case. They also make use of foundry.data.fields to make it easier to further customize the type behavior.

Boolean


game.settings.register('core', 'myCheckbox', {
  name: 'My Boolean',
  config: true,
  type: new foundry.data.fields.BooleanField(),
});

game.settings.get('core', 'myCheckbox'); // false
String/Text Input


game.settings.register('core', 'myInput', {
  name: 'My Text',
  config: true,
  type: new foundry.data.fields.StringField(),
});

game.settings.get('core', 'myInput'); // 'Foo'
Select Input


game.settings.register('core', 'mySelect', {
  name: 'My Select',
  config: true,
  type: new foundry.data.fields.StringField({
    choices: {
      "a": "Option A",
      "b": "Option B"
    },
  }),
});

game.settings.get('core', 'mySelect'); // 'a'
The key of the choices object is what is stored in the setting when the user selects an option from the dropdown.

The values of the choices object are automatically run through game.i18n.localize before being displayed in the Setting UI.

Number Input


game.settings.register('core', 'myNumber', {
  name: 'My Number',
  config: true,
  type: new foundry.data.fields.NumberField(),
});

game.settings.get('core', 'myNumber'); // 1
Number Range Slider


game.settings.register('core', 'myRange', {
  name: 'My Number Range',
  config: true,
  type: new foundry.data.fields.NumberField({
    min: 0, max: 100, step: 10,
    initial: 0, nullable: false
  }),
});

game.settings.get('core', 'myRange'); // 50
File Picker


game.settings.register('core', 'myFile', {
  name: 'My File',
  config: true,
  type: String,
  filePicker: true,
});

game.settings.get('core', 'myFile'); // 'path/to/file'
File Picker Types
The following can be given to the filePicker option to change the behavior of the File Picker UI when it is opened. These are useful if you need the user to select only an image for instance.

'audio' - Displays audio files only
'image' - Displays image files only
'video' - Displays video files only
'imagevideo' - Displays images and video files
'folder' - Allows selection of a directory (beware, it does not enforce directory selection)
'font' - Display font files only
'graphics' - Display 3D files only
'text' - Display text files only
'any' - No different than true
Directory Picker
If the setting is registered with either the default filePicker: true or filePicker: 'folder' it is possible for a user to select a directory instead of a file. This is not forced however and the user might still select a file.

When saved, the directory path is the only string which is saved and does not contain information about the source which the directory was chosen from. Without strict assumptions and checking those assumptions, this kind of setting has a high chance of causing errors or unexpected behavior (e.g. creating a folder on the user's local storage instead of their configured S3 bucket).

Setting Menus
Sometimes a package is more complex than a few settings will allow a user to configure. In these cases it is recommended to register a settings menu with game.settings.registerMenu, and manage the configuration with a FormApplication or Dialog. Note that registerMenu does not register a setting by itself, simply a menu button.

Menus work best when used in conjunction with a registered setting of type Object which has been set to config: false. A menu could also be used to control many individual settings if desired.

game.settings.registerMenu("myModule", "mySettingsMenu", {
  name: "My Settings Submenu",
  label: "Settings Menu Label",      // The text label used in the button
  hint: "A description of what will occur in the submenu dialog.",
  icon: "fas fa-bars",               // A Font Awesome icon used in the submenu button
  type: MySubmenuApplicationClass,   // A FormApplication subclass
  restricted: true                   // Restrict this submenu to gamemaster only?
});


game.settings.register('myModuleName', 'myComplexSettingName', {
  scope: 'world',     // "world" = sync to db, "client" = local storage
  config: false,      // we will use the menu above to edit this setting
  type: Object,
  default: {},        // can be used to set up the default structure
});


/**
 * For more information about FormApplications, see:
 * https://hackmd.io/UsmsgTj6Qb6eDw3GTi5XCg
 */
class MySubmenuApplicationClass extends FormApplication {
  // lots of other things...

  getData() {
    return game.settings.get('myModuleName', 'myComplexSettingName');
  }

  _updateObject(event, formData) {
    const data = expandObject(formData);
    game.settings.set('myModuleName', 'myComplexSettingName', data);
  }
}
Why would I want this?
FormApplications in particular allow you to run any logic you want during the _updateObject method. This could be leveraged to accomplish many things:

Space. You could use this to tidy up a lot of module settings which would otherwise take up an excessive amount of vertical space on the settings list.
Validation. Since you control the FormApplication's submit logic (_updateObject), you could run validation on user inputs before saving them to the setting value.
Edit Setting Objects. If you have a use case for a complex object of data being stored as a setting, a FormApplication menu would let your users manipulate that object directly.
Troubleshooting
Here are some common issues when working with settings.

Cannot set properties of undefined (setting 'key')
Happens when game.settings.register is called with an invalid first argument. This first argument is intended to be the id or name of an active package.

Not a registered game setting
game.settings.get and .set both throw this error if the requested setting has not been registered yet.

Cannot set a setting before Game is Ready
Foundry has a hard limit in ClientSettings##setWorld that prevents modifying the game settings prior to ready. This means any "module setup" type dialogs should wait until Hooks.once("ready".

--------------

Flags
Flags represent key-value type data which can be used to store flexible or arbitrary data required by either the core software, game systems, or user-created modules.
Page Contents
Tags
Last edited by
chaosos
06/13/2024
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


------------------
Game
The core Game instance which encapsulates the data, settings, and states relevant for managing the game experience. The singleton instance of the Game class is available as the global variable game.
Page Contents
Tags
Last edited by
chaosos
05/03/2024
Up to date as of v11

The Game class is the upper-most level of Foundry's data architecture and is responsible for initializing the application. It's usually referenced by the singleton game instance.

Official documentation

Game
The Game class relies heavily on read-only properties which are not documented by the official JSDoc, you can see the class in more detail in your local install at foundryInstallPath\resources\app\client\game.js.

Legend

Game.create // `.` indicates static method or property
Game#system // `#` indicates instance method or property
game.system // Lowercase game also indicates instance method or property
Overview
When a client connects to a Foundry server, after all relevant system and module code is imported, the Game class is initialized in the globally available instance game. This process instantiates everything else available to Foundry developers, such as loading information from the databases and initializing the canvas.

More information on how data is processed is available in the From Load to Render guide.

Key Concepts
The following lays out how the game object acquires its properties.

Constructor
The basics of how the game object is instantiated and its properties are filled in are as follows

Game.create is called after all code is imported
a. Game.connect establishes the underlying socket connection with the server
b. Game.getData fetches the live data from the database.
c. new Game constructs the singleton instance which is publicly stashed as game
Game.initialize is called, which progressively builds out the game instance and calls a series of hooks.
Note that the globally-available CONST and CONFIG objects are simply initialized as part of loading the relevant javascript module files (common\constants.mjs and client\config.js respectively). However, one should be hesitant to modify them before the init hook, to avoid any issues with module load order.

Game initialization hooks
Developers of all kinds almost always need to work with one or more of the following hooks. This section provides information on what is available at each stage. Each of these hooks is only called once, so there's no functional difference between Hooks.once("init", callback) and Hooks.on("init", callback).

init
The first Hook available to a Foundry developer. The following are typical actions performed in this hook.

The CONFIG object is modified
Document classes are registered
Sheet classes are registered
Game settings are registered
This is called before any of the other processes in Game#initialize; as such, the only properties available are the ones added in the constructor. These are constructed as read-only properties and so do not currently show up in Foundry's documentation.

view
data
release
userId
system
modules
workers
sessionId
socket
time
audio
clipboard
debug
loading
ready (starts false)
The following properties are technically available but are not yet properly initialized with their data

collections
packs
i18n
keyboard
mouse
gamepad
nue
permissions
settings
keybindings
canvas (and its global pointer canvas)
video
tooltip
tours
documentIndex
issues
i18nInit
Technically called at the end of Localization#initialize, this hook is called after the the following methods:

Game#registerSettings — Registers various core settings
game.i18n is fully set up, so game.i18n.localize and other similar methods are available
setup
This hook is less commonly used. It's called after the following are established

Game#registerTours — initializes game.tours
Game#activateListeners — initializes game.tooltip, game.video
game.permissions — loaded from world setting
Game#initializePacks — initalizes game.packs
Game#initializeDocuments — initializes game.collections and instantiates world collections like game.actors for all primary document types.
The main point of the setup hook is it's after document data is loaded but before the canvas is initalized.

ready
The final step of Foundry's initialization process, this hook is called after all of these other methods are called.

Game#initializeRTC — initializes game.webrtc
Game#initializeMouse — initializes game.mouse
Game#initializeGamepads — initializes game.gamepad
Game#initializeKeyboard — initializes game.keyboard and game.keybindings
Game#initializeCanvas — initializes game.canvas
Game#initializeUI — Renders UI elements like the sidebar
DocumentSheetConfig.initializeSheets — processes registered sheet classes
Game#activateSocketListeners — Enables various pieces of interactivity and data-sharing that occur over sockets
DocumentIndex#index — initializes game.documentIndex
NewUserExperience#initialize — initializes game.nue
game.ready = true
World Collections
The game object is where the in-world documents are stashed. Each of the primary document types has a WorldCollection, which is sourced from [Class].metadata.collection, e.g. Actor.metadata.collection returns "actors", and so game.actors is a collection of actors.

Unlike Compendium Collections, all documents in world collections are stored in-memory on the client, so access can be performed synchronously. Updates are still asynchronous to allow synchronization between clients.

It's worth noting that game.collections is itself a Collection of these world collections. However, it's basically never necessary to use that.

API Interactions
World Collection Document Access
WorldCollection extends DocumentCollection, which provides the bulk of methods for interacting with the stored documents.

Accessing individual documents
There's two main ways to get documents from a world collection, both of which run synchronously.

WorldCollection#get, which fetches by document id.
WorldCollection#getName, which fetches by the document's name property.
The global methods, fromUuid and fromUuidSync both work with documents in world collections; fromUuidSync in particular is quite useful because it remains synchrous and has no problem fetching embedded documents.

Invalid Documents: Sometimes, a data model update will mark a document as invalid if it fails to cast data (a common example is Number('30 ft') returns NaN). In this cases, there's a few ways to access invalid documents

DocumentCollection#getInvalid(id) is the primary canonical way.
DocumentCollection#invalidDocumentIds is a Set, which can be iterated through with a for loop or accessed with a simple invalidDocumentIds.first().
Accessing many documents
The upstream Collection class provides several ways of accessing the values stored inside: for and forEach iteration, map, reduce, filter, and some.

The DocumentCollection class adds the search function, which will look through all searchable fields based on the data model's metadata.

A third option is to use WorldCollection#folders, but this is generally inferior to just using filter(d => d.folder.id === 'targetFolderID') or some other construction with those basic methods inherited from Collection.

Specific Use Cases
Here are some specific tips and tricks with the game instance

Adding functions for others to use
Dumping functions into the global scope with globalThis.myFunc = myFunc can be risky if there's a name collission with another package. One way to deal with this is to add them to your package's instance, at either game.system or game.modules.get('my-module'). By convention, many group them under the api

function myFunction() {}

// Doing it here requires assigning during
Hooks.once("init", () => {
  // system example
  game.system.api = {
    myFunction,
  }

  // module example
  game.modules.get('my-module').api = {
    myFunction,
  }
})

// a macro could then call the function with
game.system.api.myFunction()
game.modules.get('my-module').api.myFunction()
One important caveat to this method is they won't reliably be available until AFTER the init hook, so this isn't as helpful for anything you expect end users to call either before hooks fire (classes to extend, for examples) or during the init hook. In these cases, just scoping out a globally available object can be preferable, such as using our package name.

Troubleshooting
Stub
This section is a stub, you can help by contributing to it.

------------

ApplicationV2
The Application class is responsible for rendering an HTMLElement into the Foundry Virtual Tabletop user interface.
Page Contents
Tags
Last edited by
Nick
10/01/2025
Up to date as of v13

Applications are a core piece of Foundry's API that almost every developer will have to familiarize themselves with. They allow developers to render HTML windows to display information and provide an interactive UI, from dialogs to character sheets to so much more.

Official Documentation

ApplicationV2
DocumentSheetV2
Legend

ApplicationV2.DEFAULT_OPTIONS // `.` indicates static method or property
Application#render // `#` indicates instance method or property
Overview
Code for ApplicationV2 and its related classes can be found at yourFoundryInstallPath/resources/app/client/applications.

Key Concepts
Here are the core things to know about ApplicationV2, including comparisons to the original Application class.

ApplicationV2 vs. Application
The ApplicationV2 class and its subclasses were introduced in Foundry V12, with the long-term goal of transitioning all applications to the new framework. The original Application class won't be gone until version 16, giving a relatively long deprecation period of 4 full versions (v12 - v15).

Native light/dark mode support
Better application window frames
Architecture supports non-Handlebars rendering engines much more easily
Support for partial re-rendering in Handlebars
Better lifecycle events
Improved a11y handling
Overall simpler and cleaner to implement
Another major change is there's no more jQuery-by-default in AppV2; all internal functions work exclusively with base javascript DOM manipulation. JQuery is still fully included in Foundry, so developers who prefer it can call const html = $(this.element) to get a jQuery representation of the application's rendered HTML.

See this guide for a detailed walkthrough of converting to AppV2.

Use of ESModules
Unlike the original Application classes, AppV2 and its subclasses are accessed through nested javascript modules, e.g. foundry.applications.api.ApplicationV2. One common trick when dealing with these is the use of destructuring to reduce line length and improve comprehensibility, e.g.

// Similar syntax to importing, but note that
// this is object destructuring rather than an actual import
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

class MyHandlebarsApp extends HandlebarsApplicationMixin(ApplicationV2) {}
Which Class to Extend
Unlike the App V1, the base App V2 class handles forms natively, without reliance on a subclass. If you're not writing some kind of Document sheet, in which case you should use the appropriate subclass, everything is going to extend ApplicationV2. However, one important thing to know is that you need to use some form of rendering engine, whether that's the Foundry-provided HandlebarsApplicationMixin or one created by a community package.

API Interactions
The following section provides guidance for implementing ApplicationV2 and its related classes

Basic lifecycle
Once the class has been defined, it can be rendered by calling new MyApp().render(true). Once an application is visible on the screen, it can be refreshed with myApp.render() (or more commonly, this.render()).

Similarly, myApp.close() will remove it from the UI, but the actual class instance will persist until the garbage collector deletes it. This means that if your retain a persistent reference (such as foundry's native handling of document sheets), application properties (like tab state) will persist between cycles of close() and render(true).

BASE_APPLICATION
In ApplicationV2 subclasses, the inheritanceChain determines how far up both DEFAULT_OPTIONS and hook calls will go from the currently instantiated class. This is controlled by the static property BASE_APPLICATION, which points to a class definition. By default, all ApplicationV2 subclasses inherit all the way up, but subclasses may prefer to limit this.

DEFAULT_OPTIONS
One property that's important to include is static DEFAULT_OPTIONS, which is an instance of the ApplicationConfiguration type. You can override or extend these options in individual instances of your application by passing an object into the constructor, e.g. new MyApplication({ position: { width: 600 }}).

There's no need to call super.mergeObject or anything here; subclasses by default merge their DEFAULT_OPTIONS into their parent class, all the way up to through the inheritance chain.

Form Handling
Unlike Application, ApplicationV2 has built in form handling with just some configuration changes. These are automatically implemented by DocumentSheetV2, so you only need to make these updates in DEFAULT_OPTIONS if you're building a form for a non-document object.

First, set the tag property to "form" instead of the default "div". This ensures the default _onSubmitForm and _onChangeForm methods are called.

Second, you must define the sub-properties inside the form property - handler is the function that actually executes the update, while submitOnChange and closeOnSubmit are booleans.

To put this all together, including the signature for the handler function, see the snippet below.

class MyApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: MyApplication.myFormHandler,
      submitOnChange: false,
      closeOnSubmit: false
    }
  }

  /**
   * Process form submission for the sheet
   * @this {MyApplication}                      The handler is called with the application as its bound scope
   * @param {SubmitEvent} event                   The originating form submission event
   * @param {HTMLFormElement} form                The form element that was submitted
   * @param {FormDataExtended} formData           Processed data for the submitted form
   * @returns {Promise<void>}
   */
  static async myFormHandler(event, form, formData) {
    // Do things with the returned FormData
  }
}
Actions
The actions object is a Record of functions that automatically get bound as click listeners to any element that has the appropriate data-action in its attributes. Importantly, these should be static functions, but their this value will still point to the specific class instance.

// for proper class definition you'd need to use HandlebarsApplicationMixin
// but it's not used here because these are properties of the base ApplicationV2 class
class MyApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    actions: {
      myAction: MyApplication.myAction
    }
  }

  /**
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - the capturing HTML element which defined a [data-action]
   */
  static myAction(event, target) {
    console.log(this) // logs the specific application class instance
  }
}
This could pair with the following HTML to add the click event. You can use whatever tags you want, but <a> tags and <button> tags usually require the least amount of additional CSS.

<a data-action="myAction">Using a link for inline text</a>
For those used to Application V1, this largely replaces the role activateListeners played. If you have other event listeners to add, you can use _onRender, which is explored in the "Specific Use Cases" section.

Header Buttons
ApplicationV2 provides a dropdown of header buttons, an alternative to the strictly in-line implementation from Application that caused problems when many different packages wanted to have header buttons. Instantiating these buttons involves the window object and its controls property, which is an array of ApplicationHeaderControlsEntry.

// for proper class definition you'd need to use HandlebarsApplicationMixin
// but it's not used here because these are properties of the base ApplicationV2 class
class MyApplication extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
    actions: {
      myAction: MyApplication.myAction
    }
    window: {
      controls: [
        {
          // font awesome icon
           icon: 'fa-solid fa-triangle-exclamation',
          // string that will be run through localization
          label: "Bar",
          // string that MUST match one of your `actions`
          action: "myAction",
        },
      ]
    }
  }
}
HandlebarsApplicationMixin
MDN docs on Mixins
Handlebars Helpers
Unless you are using an external rendering package, every AppV2 instance is going to extend HandlebarsApplicationMixin. This function returns a HandlebarsApplication class which fully implements the rendering logic required by ApplicationV2.

PARTS
The core of HandlebarsApplication is the static PARTS property, which is a Record consisting of objects with the following structure:

/**
 * @typedef {Object} HandlebarsTemplatePart
 * @property {string} template                      The template entry-point for the part
 * @property {string} [id]                          A CSS id to assign to the top-level element of the rendered part.
 *                                                  This id string is automatically prefixed by the application id.
 * @property {string[]} [classes]                   An array of CSS classes to apply to the top-level element of the
 *                                                  rendered part.
 * @property {string[]} [templates]                 An array of templates that are required to render the part.
 *                                                  If omitted, only the entry-point is inferred as required.
 * @property {string[]} [scrollable]                An array of selectors within this part whose scroll positions should
 *                                                  be persisted during a re-render operation. A blank string is used
 *                                                  to denote that the root level of the part is scrollable.
 * @property {Record<string, ApplicationFormConfiguration>} [forms]  A registry of forms selectors and submission handlers.
 */
Replicating a v1 Application is fairly simple - just pass a single part!

static PARTS = {
  form: {
    template: "modules/my-module/templates/my-app.hbs"
  }
}
However, you may want to have an application that leverages the flexibility of multiple parts. When using multiple parts, it's important to know the following

Each part must return a single HTML element - that is, only one pair of top-level tags.
The parts are concatenated in the order of the static property
All parts are encapsulated by the top-level tag set in options.tag - this is a div by default in ApplicationV2, but DocumentSheetV2 changes this to form.
Broadly speaking, this means the most straightforward way to structure a multi-part application is to lead with a header part, then optionally a distinct tabs part, then finally one part for each of your tabs. You can even add a footer at the end!

Only Displaying Some Parts
One way to leverage parts is to only show some of them sometimes. The correct place to do this is by extending _configureRenderOptions; you do want to call super here, as some important things happen upstream.

// This isn't DocumentSheet specific, but it's the most common place you'll want this
class MyApplication extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static PARTS = {
    header: { template: '' },
    tabs: { template: '' },
    description: { template: '' },
    foo: { template: '' },
    bar: { template: '' },
  }

  /** @override */
  _configureRenderOptions(options) {
    // This fills in `options.parts` with an array of ALL part keys by default
    // So we need to call `super` first
    super._configureRenderOptions(options);
    // Completely overriding the parts
    options.parts = ['header', 'tabs', 'description']
    // Don't show the other tabs if only limited view
    if (this.document.limited) return;
    // Keep in mind that the order of `parts` *does* matter
    // So you may need to use array manipulation
    switch (this.document.type) {
      case 'typeA':
        options.parts.push('foo')
        break;
      case 'typeB':
        options.parts.push('bar')
        break;
    }
  }

}
_prepareContext
The variable-based rendering of handlebars is handled by _prepareContext, an asynchronous function that returns a context object with whatever data gets fed into the template. It has a single argument, options, which is the options object passed to the original render call, but this can usually be ignored.

In Application V1 terms, this is functionally equivalent to its getData call, with the only functional change that this is always asynchronous.

Inside your handlebars template, you'll only have access to the data setup in _prepareContext, so if you need to include information such as CONFIG.MYSYSTEM you'll want to include a pointer to it in the returned object.

Note

The disconnect between the data provided to the template via _prepareContext and the way that DocumentSheetV2 stores data to the document via the name="" field can cause some confusion. It's common practice to store the document's system data in a system key in the context, which means that you can usually do value="{{system.attribute.value}}" and name="system.attribute.value" in an actor/item sheet and stuff works.

However, under the hood, the {{}} is pulling stuff from the context object that the _prepareContext returns while the name="" is storing things based on the data path in the document itself. This means that there are situations where they won't actually line up, because they're not fundamentally pointing at the same thing at the end of the day, they just happen to often line up.

_preparePartContext
The HandlebarsApplicationMixin provides an additional method for handling context that can be useful, especially in conjunction with only rendering some of the parts so only processes that are actually necessary happen. You can cleanly override this method and ignore its addition of partId to the context.

/**
 * Prepare context that is specific to only a single rendered part.
 *
 * It is recommended to augment or mutate the shared context so that downstream methods like _onRender have
 * visibility into the data that was used for rendering. It is acceptable to return a different context object
 * rather than mutating the shared context at the expense of this transparency.
 *
 * @param {string} partId                         The part being rendered
 * @param {ApplicationRenderContext} context      Shared context provided by _prepareContext
 * @returns {Promise<ApplicationRenderContext>}   Context data for a specific part
 * @protected
 */
async _preparePartContext(partId, context) {
  context.partId = `${this.id}-${partId}`;
  return context;
}
However, a common pattern is to use a switch statement on the partId argument and then handle part-specific logic in the cases. This can allow you to both contextually override properties (tab info) or only do work if it's necessary (such as a limited sheet that doesn't render actor inventory).

templates
The templates property of a part is used by HandlebarsApplication#_preFirstRender; the declared parts are all added to a Set (to filter out duplicates) and then transformed into an array to be passed to loadTemplates. In v12, your primary template must be included in this array if you're using it.

Two important caveats to using this property

If you are otherwise overriding _preFirstRender, you must call await super._preFirstRender(context, options); to preserve this handling
The templates property only accepts a string array, so there's no way to reference these partials as a key-value record for more succinct references in the handlebars. You need to externally call loadTemplates if you wish to register templates with an ID.
Specific Use Cases
Below are some specific tricks and techniques to use with ApplicationV2 and its subclasses.

Adding Event Listeners
The actions field, explored above, is usually sufficient for most sheet listeners - however, sometimes you need other, non-click listeners. For example, many systems like to display physical item's quantity as an editable field on the actor sheet, which isn't natively supported by Foundry's form submission and data architecture. The best place to add these is the _onRender function.

class MyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
    _onRender(context, options) {
        // Inputs with class `item-quantity`
    const itemQuantities = this.element.querySelectorAll('.item-quantity')
    for (const input of itemQuantities) {
      // keep in mind that if your callback is a named function instead of an arrow function expression
      // you'll need to use `bind(this)` to maintain context
      input.addEventListener("change", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const newQuantity = e.currentTarget.value
        // assuming the item's ID is in the input's `data-item-id` attribute
        const itemId = e.currentTarget.dataset.itemId
        const item = this.actor.items.get(itemId)
        // the following is asynchronous and assumes the quantity is in the path `system.quantity`
        item.update({ system: { quantity: newQuantity }});
      })
    }
  }
}
There are much less verbose implementations of the above code - the whole thing is theoretically doable in a single line - but for clarity this example does each piece step-by-step.

Tabs
Tabs in V12
ApplicationV2 in V12 includes partial support for tabs with the changeTab method and the tabGroups record. However, HandlebarsApplicationMixin will not automatically re-apply the relevant class adjustments on re-render automatically, meaning that developers are responsible for maintaining that status themselves.

Tab Navigation. There's a handy Foundry-provided template for tabs at templates/generic/tab-navigation.hbs you may want to use. It expects an array or record of ApplicationTab supplied in a field named tabs. A record is preferable to an array because it can be more easily used in tab display. (This is merely a typedef, you must actually construct the object yourself)

/**
 * @typedef ApplicationTab
 * @property {string} id         The ID of the tab. Unique per group.
 * @property {string} group      The group this tab belongs to.
 * @property {string} icon       An icon to prepend to the tab
 * @property {string} label      Display text, will be run through `game.i18n.localize`
 * @property {boolean} active    If this is the active tab, set with `this.tabGroups[group] === id`
 * @property {string} cssClass   "active" or "" based on the above boolean
 */
Tab Display. Each element representing one of your tabs must have the following attributes

data-group, for the tab's group
data-tab, for the tab's ID
You'll want to include cssClass within your tab's class property to track active or not.
If each of your tabs is a part, then you can store your tabs as Record<partId, ApplicationTab>. Then, in _preparePartContext, set context.tab = context.tabs[partId]. A simple example of the target handlebars:

<section class="tab {{tab.cssClass}}" data-group="primary" data-tab="foo">
    {{! stuff }}
</section>
Tabs in V13
The V13 implementation of ApplicationV2 has better tab support. See Tabs in AppV2 for additional information.

Text Enrichment
API Reference

TextEditor.enrichHTML
HandlebarsHelpers.editor
EnrichmentOptions
Text enrichment is the process of replacing and augmenting input text like [[/roll 1d6]] in the final rendered HTML. It's most commonly used with the {{editor}} Handlebars helper.

Text enrichment is an asynchronous process, which means it needs to happen inside _prepareContext before template rendering. The first argument is a path to the raw html string to be enriched, the second argument implements EnrichmentOptions.

// Exact process may differ for non-handlebars mixins
class MyApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  async _prepareContext() {
    const context = {};

    // Be mindful of mutating other objects in memory when you enrich
    context.enrichedDescription = await TextEditor.enrichHTML(
      this.document.system.description,
      {
        // Only show secret blocks to owner
        secrets: this.document.isOwner,
        // For Actors and Items
        rollData: this.document.getRollData
      }
    );

    return context;
  }
}
The corresponding handlebars helper, as text enrichment is typically paired. The target property should match the source of what was enriched, in this case the assumption is that system.description of the document was the field run through enrichment. The editable value here is inherited from super.getData, which is why it's not explicitly declared in context above.

{{editor enrichedDescription target="system.description" editable=editable button=true engine="prosemirror" collaborate=false}}
If you're just trying to display enriched text without providing an editor input - such as an item's description in an actor sheet - triple braces will render a string as raw HTML.

{{{enrichedDescription}}}
DragDrop
API Reference

DragDrop
DragDropConfiguration
The DragDrop helper class integrates dragging and dropping across different applications in the Foundry interface. The most common use is dragging and dropping documents from one location to another.

ApplicationV2 does not include an implementation of this handling, but the helper class still works - you just have to write it yourself. The following implementation uses HandlebarsApplicationMixin, but this should work with other rendering engines.

Step 1: Initialize the DragDrop. To do this, we need to override the constructor so the DragDrop class is instantiated as part of the application class.

class MyAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.#dragDrop = this.#createDragDropHandlers();
  }

  /**
   * Create drag-and-drop workflow handlers for this Application
   * @returns {DragDrop[]}     An array of DragDrop handlers
   * @private
   */
  #createDragDropHandlers() {
    return this.options.dragDrop.map((d) => {
      d.permissions = {
        dragstart: this._canDragStart.bind(this),
        drop: this._canDragDrop.bind(this),
      };
      d.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this),
      };
      return new DragDrop(d);
    });
  }

  #dragDrop;

  // Optional: Add getter to access the private property

  /**
   * Returns an array of DragDrop instances
   * @type {DragDrop[]}
   */
  get dragDrop() {
    return this.#dragDrop;
  }

}
Step 2: Define options.dragDrop. This implementation mimics the Application implementation by using options.dragDrop to define a class's bound drag handlers. The options object is compiled from the applications DEFAULT_OPTIONS, like the following:

class MyAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    dragDrop: [{ dragSelector: '[data-drag]', dropSelector: null }],
  ]
}
Step 3: Define the handlebars templating. Our actual draggable objects need to have the data-drag property, but the actual value of the property doesn't matter unless you want it to.

<ol class="foo">
    {{#each someArray}}
    <li data-drag="true">{{this.label}}</li>
  {{/each}}
</ol>
Step 4: Bind the DragDrop listeners. In AppV2, event listeners for non-click events are handled inside _onRender (Click events should be implemented as Actions, see above for more details).

class MyAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Actions performed after any render of the Application.
   * Post-render steps are not awaited by the render process.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @protected
   */
  _onRender(context, options) {
    this.#dragDrop.forEach((d) => d.bind(this.element));
  }
}
Step 5: Define callbacks. Back in step 1, we defined a number of callbacks during #createDragDropHandlers. Now we just need to implement them!

class MyAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * Define whether a user is able to begin a dragstart workflow for a given drag selector
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(selector) {
    // game.user fetches the current user
    return this.isEditable;
  }


  /**
   * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector
   * @param {string} selector       The candidate HTML selector for the drop target
   * @returns {boolean}             Can the current user drop on this selector?
   * @protected
   */
  _canDragDrop(selector) {
    // game.user fetches the current user
    return this.isEditable;
  }


  /**
   * Callback actions which occur at the beginning of a drag start workflow.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDragStart(event) {
    const el = event.currentTarget;
    if ('link' in event.target.dataset) return;

    // Extract the data you need
    let dragData = null;

    if (!dragData) return;

    // Set data transfer
    event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
  }


  /**
   * Callback actions which occur when a dragged element is over a drop target.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  _onDragOver(event) {}


  /**
   * Callback actions which occur when a dragged element is dropped on a target.
   * @param {DragEvent} event       The originating DragEvent
   * @protected
   */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);

    // Handle different data types
    switch (data.type) {
        // write your cases
    }
  }
}
There you have it, a basic implementation of DragDrop in ApplicationV2!

SearchFilter
API Reference

SearchFilter
SearchFilterConfiguration
The SearchFilter helper class connects a text input box to filtering a list of results. It suppresses other events that might fire on the same input, instead activating the bound callback to modify the targeted HTML.

ApplicationV2 does not implement its own SearchFilter support so you'll have to initialize it in the constructor or as a class property. Then you'll need to call bind(this.element) in _onRender. The callback parameter, while only referred to as the base Function in SearchFilterConfiguration, matches the signature of Application#_onSearchFilter, provided below.

/**
 * Handle changes to search filtering controllers which are bound to the Application
 * @param {KeyboardEvent} event   The key-up event from keyboard input
 * @param {string} query          The raw string input to the search field
 * @param {RegExp} rgx            The regular expression to test against
 * @param {HTMLElement} html      The HTML element which should be filtered
 * @protected
 */
_onSearchFilter(event, query, rgx, html) {}
The body of this function must do the actual DOM manipulation; rgx.test is probably helpful, as are operations on the provided html element to mark elements as display: hidden or other ways of removing them from display in the DOM.

Registering Document Sheets
API Reference

DocumentSheetConfig.registerSheet
When you define a new document sheet, you can register it in the init hook so it's configurable.

// You need to separately define your DocumentSheetV2 subclass
class MyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {}

Hooks.once("init", () => {
  // The the `config` object in the fourth argument is entirely optional, as are its properties
  DocumentSheetConfig.registerSheet(Actor, "package-id", MyActorSheet, {
    // Any string here will be localized
    label: "MyPackage.MyDocumentSheet.Label",
    // If the sheet is only usable for some values of the `type` field
    types: ["character, npc"],
    // Generally useful, defaults to false
    makeDefault: true,
    // There are other properties that are rarely needed. See the linked docs for more.
  })
  // `Actors.registerSheet` is semantically equivalent to passing Actor as the first argument
  // This works for all world collections, e.g. Items
  Actors.registerSheet("package-id", MyActorSheet, {})
}
Easy form submission buttons
Add the following to your static PARTS:
footer: {
    template: "templates/generic/form-footer.hbs",
}
Add the following to the return value of _prepareContext:
buttons: [
    { type: "submit", icon: "fa-solid fa-save", label: "SETTINGS.Save" },
    // { type: "reset", action: "reset", icon: "fa-solid fa-undo", label: "SETTINGS.Reset" },
]
Move all your buttons to the buttons array above.
Be sure the HTML template for your form declared in static PARTS doesn't contain a HTML <form> (change them to <div>). Otherwise, your formData argument on the submit method will be empty.
Non-Handlebars Rendering Frameworks
The following are community implementations of non-handlebars rendering frameworks.

Vue by Mouse0270
Svelte by ForgemasterModules
Troubleshooting
Here are some common problems people run into with applications in Foundry.

Using a button triggers full web page refresh
By default, a button will trigger the submit process of whatever form it is in. AppV2 will attempt to capture this if you have form handling configured with tag: "form" and a registered handler in DEFAULT_OPTIONS, however if that is not the case then the default browser behavior is to submit the webpage - causing a full refresh.

To fix this, add type="button" to the attributes of any button you don't want to trigger a submission event.

Arrays in Forms
Foundry only natively handles arrays of primitives in its forms - that is, an array of strings, numbers, or booleans. If you have an array of objects, you have two options

Override DocumentSheetV2#_prepareSubmitData, calling super then modifying the data it returns. If you're not subclassing DocumentSheetV2, your own form handler is fully in charge of handling the data.
Implement a DataModel for whatever you're returning, allowing the casting in ArrayField to handle the transformation.
Debugging CSS
The following script macro will toggle the color scheme between light and dark.

const uiConfig = game.settings.get('core', 'uiConfig');
const color = uiConfig.colorScheme.applications;
const newColor = color === 'light' ? 'dark' : 'light';
uiConfig.colorScheme.applications = newColor;
uiConfig.colorScheme.interface = newColor;
await game.settings.set('core', 'uiConfig', uiConfig)

------------------

Data Model
The abstract base class which defines the data schema contained within a Document.
Page Contents
Tags
Last edited by
Luber
08/25/2025
Up to date as of v12

"Data Model" refers both to the root class that Document extends, as well as the TypeDataModel class that can be instantiated for the system property of eligible document types.

Official documentation

v10 Data Model
Introduction to System Data Models
DataModel API reference
TypeDataModel API reference
DataField API reference
Legend

DataModel.defineSchema // `.` indicates static method or property
DataModel#invalid // `#` indicates instance method or property
Overview
The data model is the root of how Foundry synchronizes information between the client and server. It includes functions for:

Cleaning data
Validating data
Migrating data
Keeping what's saved to the database separate from what's served to developers
As a System developer: Data models can entirely replace the type-specific field initialization of the template.json; the dnd5e system is an example of how much you can trim down that file, letting the data model do the rest.

As a Module developer: Data models are necessary for Module Sub-Types, where you provide your own new type of Actor, Item, JournalEntry, or other document sub-type.

Key Concepts
Working with data models doesn't have to be daunting - almost all of the functionality is provided just by extending the appropriate DataModel class. (System and module developers usually want to start by extending foundry.abstract.TypeDataModel)

_source vs. initialized properties
Data models keep two copies of their stored data; a database-friendly version under _source, and then the "initialized" properties at the top level of the data model. For example, Actor#_source.folder is a string that references the ID of the containing folder, while Actor#folder is a pointer to the folder instance. Actor#_source.items is an array, Actor#items is a Collection. Foundry usually intelligently handles either type when passing in data that matches either format in a create or update call, but core bugs in this handling do exist and your own code may need to keep these differences in mind.

IN GENERAL You do not need to interact with the data in _source - it has NOT been put through the prepareData cycle. However, DataModel#toObject() by default returns the contents of _source, and even invoking toObject(false) will still give the data structure of source (arrays and objects instead of sets, maps, and collections) but with the post-prepareData values.

The Schema
The one piece of information you MUST provide is the static defineSchema() method, which returns an key-value record where every value is a subclass of DataField. Foundry makes many of these subclasses available at foundry.data.fields, so it's common practice to lead a schema definition with const fields = foundry.data.fields. The following diagram provides some details on the inheritance

DataField
    SchemaField
    EmbeddedDataField
      EmbeddedDocumentField
    DocumentStatsField
  BooleanField
  NumberField
    AngleField
    AlphaField
    HueField
    IntegerSortField
  StringField
    DocumentIdField
      ForeignDocumentField
    DocumentUUIDField
    ColorField
    FilePathField
    JSONField
    HTMLField
    JavaScriptField
    DocumentTypeField
  ObjectField
    DocumentOwnershipField
    TypeDataField
  ArrayField
    SetField
    EmbeddedCollectionField
      EmbeddedCollectionDeltaField
  AnyField
  TypedSchemaField
You don't have to use the most nested versions of a field; in fact, it's frequently better not to — StringField works great by itself. Furthermore, several of these fields are NOT for system and module developers (e.g. EmbeddedCollectionField and EmbeddedDocumentField), as they require server-side support: This isn't a clever way to do "items within items".

These fields are defined in yourFoundryInstallPath\resources\app\common\data\fields.mjs as well as the official API docs.

SchemaField vs. EmbeddedDataField
These two fields serve a similar purpose: They allow you to nest properties, so you can have doc.system.myProp.fieldOne and doc.system.myProp.fieldTwo. The difference is that SchemaField creates a nested object, while EmbeddedDataField is a full class instance. This can be useful if you want to have getters or other functions nested deeper than doc.system.myFunc - you could have doc.system.embedField.myFunc. The downside is certain interactions, such as the javascript spread operator { ... }, may not work as expected because it is a full class instance rather than a simple object.

DataField options
There's quite a few options you can pass to DataField, which are officially documented here. However, the most common change in a subclass is its handling of the options and what the defaults are.

You can see a complete overview of DataFields and how they override or expand options summarized in this sheet. On it, asterixes mark how many levels of inheritance up the source of the value comes from, and underlined values indicated values forced in that field's constructor.

Here's some important information to know about each option:

required and nullable
Default: required: false and nullable: false

These two options control _validateSpecial; required prevents passing an undefined value, while nullable allows a null value. The important difference is that null will not be overridden by initial but undefined will always be replaced by an initial value if it is present.

blank: In StringField and its subclasses, blank operates on a similar level to required and nullable by controlling if '' is a valid value; it's even checked at the same step with _validateSpecial. By default, blank is true EXCEPT if choices is provided, in which case blank defaults to false. Also, basically every StringField subclass sets blank: false in its defaults.

initial
Default: undefined

In addition to being a static value, this can be a function which takes in the entire data model as an argument and returns a value. If required is true and there's no initial value, this will create errors if the field is not passed in the constructor.

StringField and its descendants modify the default slightly; if you pass required: true, blank: true, that's equivalent to also passing initial: "".

readonly
Default: false

This option prevents a field from being changed after initial creation. Readonly fields can still be altered by Document#_preCreate and the preCreateDocument hook, and can be dynamically set if initial is a function.

validate and validationError
Default: validate: undefined and validationError: "is not a valid value"

If defined, validate should have the signature (value, options) => boolean; returning false is functionally the same as throwing a DataModelValidationFailure. This can be useful when you don't want to entirely define a new DataField subclass but do want a bit of additional handling, such as enforcing that a StringField is all lowercase with no special characters. The second argument, options, is documented here.

The validationError option can be used with or without the validate option; it simply replaces the default console errors generated on a type validation failure. Many data field subclasses replace the default string with more specific language.

label and hint
Default: "" (for both)

These fields are used by the formInptut and formField handlebars helpers. If you implement LOCALIZATION_PREFIXES you don't need to manually define them, instead you can just structure your en.json file to provide the appropriate info.

Other Options
DataField subclasses sometimes take additional options. These are always in addition to the baseline DataFieldOptions.

NumberFieldOptions
StringFieldParams
FilePathFieldOptions
DataModel#constructor
Developers generally don't need to know the ins and outs of how new DataModel works. In case you do, the following summarizes the steps that occur using a new Actor as an example. For reference, Actor extends ClientDocumentMixin(BaseActor), and BaseActor extends Document extends DataModel, so there are five distinct layers of inheritance happening.

Actor doesn't override the constructor, but ClientDocumentMixin does; that calls super and then instantiates the apps record and the _sheet pointer. The super call skips through BaseActor and Document, as neither override the constructor, landing us in DataModel#constructor. Within this function several steps happen:

_source is set to the return of _initializeSource
_configure is called
validate is called
_initialize is called
The following sections explain each of those function calls. Whenever a data model is updated, only validate and _initialize are called, as the first two define many read-only properties.

DataModel#_initializeSource
Actor#_initializeSource routes to BaseActor#_initializeSource, which calls super then sets up some default prototypeToken properties. Otherwise, the relevant pieces are in DataModel, which checks that the source data provided is an object then calls migrateDataSafe, cleanData, and shimData. Importantly, these changes are at the lowest level of the data model and safeguard the data that is actually saved to the database.

migrateDataSafe: An error-checking wrapper for migrateData, this moves old data loaded from the database into new formats (this is a synchronous operation; the moves are not saved back to the database automatically). DataModel#migrateData calls this.schema.migrateSource(), which ripples down to trigger migrations on any embedded data models such as Actor#system.

cleanData: This just calls schema.clean, which propagates calls to all the fields to run _cast and _cleanType. For example, NumberField constricts the value to any provided min or max values, StringField will trim the input, and generally the DataFields attempt type coercion.

shimData: This is where Foundry adds pointers like Actor#data pointing to Actor#system with their deprecation warnings getter/setters.

DataModel#_configure
This function defines all sorts of additional pointers and getters necessary to make the data model function. Data Model does not natively do anything here, it's strictly for subclasses. Actor#_configure calls super then defines its _dependentTokens; in Document#_configure, the document's collection relationships are setup, both where it can be found as well as any embedded collections it might have.

DataModel#validate
This method is similar to cleanData but is more thorough, allowing things like joint validation rules where multiple fields are considered together. A simple example of this is folders checking that their parent pointer is not pointing to themselves, checking the folder property against the _id property.

DataModel#_initialize
This method copies data from the _source field to the top level of the data model. For Actor, the soonest layer of inheritance is ClientDocument, which calls super before kicking off the prepareData cycle; for more on that, check out From Load to Render.

API Interactions
Beyond their class definitions, there's a few other things to know with data models. More interactions can be found on the Document page.

Registering Data Models
Document data models MUST be registered in an init hook.

// Example of importing the relevant Data model classes
// Later sections have worked implementations of these models
import { PawnData, HeroData, VillainData } from "./module/data.mjs"

Hooks.once("init", () => {
  // Use Object.assign over foundry.utils.mergeObject to preserve static properties
  Object.assign(CONFIG.Actor.dataModels, {
    // The keys are the types defined in our template.json
    pawn: PawnData,
    hero: HeroData,
    villain: VillainData
  })
  // You can repeat with other document types, e.g. CONFIG.Item.dataModels
})
Examples of DataField usage
The various data fields may be a bit obscure, so here are a few examples for each field of where they're

SchemaField: ChatMessage#speaker, Scene#grid
BooleanField: ActiveEffect#disabled, Card#drawn
NumberField: Combatant#initiative, Token#width
StringField: Actor#name, Actor#type
ObjectField: Actor#flags
ArrayField: ActiveEffect#changes, Card#faces
SetField: ActiveEffect#statuses, BasePackage#esmodules
EmbeddedDataField: Actor#prototypeToken, Drawing#shape
EmbeddedCollectionField: Actor#items, Combat#combatants
EmbeddedCollectionDeltaField: ActorDelta#items, ActorDelta#effects
EmbeddedDocumentField: Token#delta (Technically an instance of ActorDeltaField, which extends EmbeddedDocumentField)
DocumentIdField: Actor#_id, Item#_id
ForeignDocumentField: Actor#folder, User#character
ColorField: Folder#color, ActiveEffect#tint
FilePathField: Actor#img, ChatMessage#sound
AngleField: Drawing#rotation, MeasuredTemplate#direction
AlphaField: AmbientSound#volume, Token#alpha
DocumentOwnershipField: Actor#ownership, Item#ownership
JSONField: Setting#value
HTMLField: ActiveEffect#description, ChatMessage#content
IntegerSortField: Actor#sort, Item#sort
DocumentStatsField: Actor#_stats, Item#_stats
TypeDataField: Actor#system, Item#system
EmbeddedCollectionField, EmbeddedCollectionDeltaField, and EmbeddedDocumentField are for use by Foundry staff only.

migrateData
API Reference

DataModel.migrateData
Document._addDataFieldMigration
The migrateData function is a powerful tool for developers making adjustments to their schemas. This function runs not only the first time a document is loaded in after a schema change, but in between any create or update call and the preCreate/preUpdate hook. This means that while it will sometimes receive the full, valid, document data, it may also receive only a portion of it.

This means migrateData is best suited for 1:1 mappings, such as changing property values or renaming a field. It's also notably not an asynchronous DB operation; it runs exclusively sychronously & locally. Changes made in migrateData will not be persisted back to the DB until the document otherwise performs a DB transaction, at which point the changes from migrateData will be included and saved.

Note: In general, it's best to close this function out with return super.migrateData(data); the actual return value is only sometimes used, but this also ensures any upstream adjustments also happen.

Changing property values
Sometimes, the value of a property needs to change. One common example is splitting off items with certain properties into a brand new item subtype. The migrateData function runs before class construction, so the resulting item will be constructed with appropriate new system data model instance.

static migrateData(data) {
    if ((data.type === 'feature') && (data?.system?.type === 'ancestry')) {
    data.type = 'ancestry';
  }

  return super.migrateData(data)
}
Field Renaming
A simple way to implement these is with Document._addDataFieldMigration, which in its second and third arguments takes the string path of the two fields. For example, if one were to want to migrate a property from flags to system, you could use the following code.

static migrateData(data) {
  foundry.abstract.Document._addDataFieldMigration(source, "flags.mySystem.stacks", "system.stacks");
  return super.migrateData(data)
}
Specific Use Cases
There's lots of great benefits of working with data models

Migrating from template.json
Classically, Foundry uses the templates object to define shared properties. DataModel.defineSchema() allows you to use standard object-oriented principles to define inheritance.

The official Introduction to System Development article provides the following snippet of a template.json as an example:

"Actor": {
  "types": ["hero", "pawn", "villain"],
  "templates": {
    "background": {
      "biography": "",
      "hairColor": "blue"
    },
    "resources": {
      "health": {
        "min": 0,
        "value": 10,
        "max": 10
      },
      "power": {
        "min": 0,
        "value": 1,
        "max": 3
      }
    }
  },
  "hero": {
    "templates": ["background", "resources"],
    "goodness": {
      "value": 5,
      "max": 10
    }
  },
  "pawn": {
    "templates": ["resources"]
  },
  "villain": {
    "templates": ["background", "resources"],
    "wickedness": {
      "value": 5,
      "max": 100
    }
  }
},
With a data model, we have two non-mutually exclusive options

Define a hierarchy of inheritance where we call super.defineSchema()
Define functions that return valid schema objects we can mix in
For example, we could structure it like this

// I threw this at the top of the file because we're re-using it lots of places
// but you probably want to break all of these class and function definitions up
// and can just stick this inside `defineSchema`
const fields = foundry.data.fields;

// Example of a helper function that allows us to minimize repetition
// You could also wrap the return object in `new SchemaField()`
function resourceField(initialValue, initialMax) {
  return {
        // Make sure to call new so you invoke the constructor!
    min: new fields.NumberField({ initial: 0 }),
    value: new fields.NumberField({ initial: initialValue }),
    max: new fields.NumberField({ initial: initialMax }),
  };
}

class CommonActorData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
    // Note that the return is just a simple object
    return {
      resources: new fields.SchemaField({
        // Whenever you want to have nested objects, wrap it in SchemaField
        health: new SchemaField(resourceField(10, 10)),
        power: new SchemaField(resourceField(1, 3))
      })
    }
  }
}

// Pawns would just have the basic resources but then you could add additional methods
class PawnData extends CommonActorData {}

class CharacterData extends CommonActorData {
    static defineSchema() {
    // CharacterData inherits those resource fields
    const commonData = super.defineSchema();
    return {
      // Using destructuring to effectively append our additional data here
      ...commonData,
      background: new fields.SchemaField({
        // Example of using a specialized field, in this case to help with sanitation
        biography: new fields.HTMLField({ initial: "" }),
        hairColor: new fields.StringField({ initial: "blue" })
      }),
    }
  }
}

// We can have branching inheritance; both VillainData and HeroData extend CharacterData
class HeroData extends CharacterData {
    static defineSchema() {
    const characterData = super.defineSchema();
    return {
      ...characterData,
      goodness: new fields.SchemaField({
        value: new fields.NumberField({ initial: 5 }),
        max: new fields.NumberField({ initial: 10 })
      }),
    }
  }
}

class VillainData extends CharacterData {
    static defineSchema() {
    const characterData = super.defineSchema();
    return {
      ...characterData,
      wickedness: new fields.SchemaField({
        value: new fields.NumberField({ initial: 5 }),
        max: new fields.NumberField({ initial: 100 })
      }),
    }
  }
}
Type specific logic
Historically, developers either used proxies and/or typeguards to implement type-specific logic; maybe both weapon and consumable should work with item.use(), but the specifics differ by type. Data models allow you to leverage conventional polymorphism; a built-in and great example of this is TypeDataModel#prepareBaseData and TypeDataModel#prepareDerivedData. The general flow of data preparation is covered in From Load to Render.

Returning to our earlier example of Heroes, Villains, and Pawns, we might have some generic logic in Actor#prepareData, but need to do specific calculations with a Hero's goodness score or a Villain's wickedness score. We can funnel those calculations to HeroData#prepareDerivedData and VillainData#prepareDerivedData, not worrying about checking this.type === "hero" and the like.

With the weapon and consumable example, we could have MyItem#use run if (this.system.use instanceof Function) this.system.use(); if it's an instance of a function, it will run, otherwise we could throw an error in console or perform some default method.

A key reason to use this pattern over typeguards and proxies is it allows module developers to leverage module sub-types; you won't know all the possible type values and their corresponding system setup, but you can check if the system object supports the operation you're trying to do.

Data Models for Settings
Settings can take a data model as an argument when registered, allowing you to have a strongly typed data.

Stub
This section is a stub, you can help by contributing to it.

ValidateJoint
API reference

The DataModel.validateJoint method is a property of data models that can be useful when handling complex, interlocked data. It's both called by the parent data model as well as any data models inside, such as the TypeDataField that represents the system field of documents and any EmbeddedDocumentField instances. If the validation fails, the method should throw an error.

Some examples of its use in Foundry's code include:

Validating that a DrawingDocument has some visible content.
Validating that a Folder does not contain itself.
Validating that a Macro has valid javascript if it is a script macro.
Troubleshooting
Below are some of the common issues people run into with data mdoels.

Registered Data Model isn't working
While data models do mostly offload their work to your javascript files, for the purposes of server side validation you must register the appropriate type in a json file. This is system.json or template.json files for systems, or the module.json file for modules.

-----------------

