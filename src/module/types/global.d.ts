/**
 * Global type declarations for Masks: A New Generation module
 * Extends fvtt-types with module-specific configurations
 */

declare module "fvtt-types/configuration" {
  interface SystemNameConfig {
    name: "pbta";
  }

  interface FlagConfig {
    Actor: {
      "masks-newgeneration-unofficial": {
        influences?: InfluenceData[];
        turnCardsCooldownRemaining?: number;
        turnCardsPotential?: number;
        lockedLabels?: Record<string, boolean>;
        lastActionTurn?: number;
      };
    };
    Combat: {
      "masks-newgeneration-unofficial": {
        lastActionTurn?: number;
      };
    };
    User: {
      "masks-newgeneration-unofficial": {
        showApplication?: boolean;
      };
    };
  }

  interface SettingConfig {
    "masks-newgeneration-unofficial.enable_dark_mode": boolean;
    "masks-newgeneration-unofficial.firstTime": boolean;
    "masks-newgeneration-unofficial.enableLoginImg": boolean;
    "masks-newgeneration-unofficial.teamPoolDocumentId": string;
    "masks-newgeneration-unofficial.teamPoolValue": number;
    "masks-newgeneration-unofficial.xcardTriggerMode": string;
    "masks-newgeneration-unofficial.xcardNotifyGMOnClick": boolean;
  }
}

/** Influence tracking data structure */
interface InfluenceData {
  id: string;
  name: string;
  hasInfluenceOver: boolean;
  haveInfluenceOver: boolean;
  locked: boolean;
}

/** Label/stat keys used in Masks */
type LabelKey = "danger" | "freak" | "savior" | "superior" | "mundane";

/** Condition names in Masks */
type ConditionName = "Afraid" | "Angry" | "Guilty" | "Hopeless" | "Insecure";

/** Move types for categorization */
type MoveType = "basic" | "playbook" | "adult" | "rules" | "PBTA_OTHER";

/** Team pool data structure */
interface TeamPoolData {
  value: number;
  documentId?: string;
}

/** Tracker types for resource tracking */
declare const enum TrackerType {
  Potential = "potential",
  TeamPool = "teamPool",
  Doom = "doom",
  Burns = "burns",
  Hold = "hold",
}

/** Global namespace augmentation */
declare global {
  interface LenientGlobalVariableTypes {
    game: never;
    canvas: never;
    ui: never;
  }

  // ============================================================================
  // FoundryVTT Core Types
  // ============================================================================

  /** Foundry utility namespace */
  interface FoundryUtils {
    escapeHTML(str: string): string;
    getProperty<T = unknown>(obj: object, path: string): T | undefined;
    setProperty(obj: object, path: string, value: unknown): boolean;
    mergeObject<T extends object>(
      original: T,
      other: Partial<T>,
      options?: { insertKeys?: boolean; insertValues?: boolean; overwrite?: boolean; recursive?: boolean; inplace?: boolean; enforceTypes?: boolean }
    ): T;
    duplicate<T>(original: T): T;
    randomID(length?: number): string;
  }

  /** Foundry global namespace */
  const foundry: {
    utils: FoundryUtils;
  };

  /** i18n localization interface */
  interface I18n {
    localize(key: string): string;
    format(key: string, data?: Record<string, unknown>): string;
    has(key: string, fallback?: boolean): boolean;
  }

  /** PbtA system configuration */
  interface PbtASheetConfig {
    actorTypes?: {
      character?: {
        stats?: Record<string, { label?: string }>;
      };
      npc?: {
        stats?: Record<string, { label?: string }>;
      };
    };
  }

  /** PbtA system globals */
  interface PbtAGlobal {
    sheetConfig?: PbtASheetConfig;
  }

  /** Notification methods interface */
  interface NotificationsMethods {
    info(message: string, options?: { permanent?: boolean }): void;
    warn(message: string, options?: { permanent?: boolean }): void;
    error(message: string, options?: { permanent?: boolean }): void;
  }

  /** UI namespace */
  interface UINamespace {
    notifications?: NotificationsMethods;
    chat?: {
      postOne(message: ChatMessage): Promise<void>;
    };
  }

  /** Game global with extended properties */
  interface GameGlobal {
    i18n?: I18n;
    pbta?: PbtAGlobal;
    user?: {
      id: string;
      name: string;
      isGM: boolean;
    };
    users?: Map<string, { id: string; name: string; isGM: boolean }>;
    actors?: Collection<Actor>;
    settings?: {
      get<T = unknown>(namespace: string, key: string): T;
      set(namespace: string, key: string, value: unknown): Promise<unknown>;
      register(namespace: string, key: string, data: object): void;
    };
    socket?: {
      emit(event: string, data: unknown): void;
      on(event: string, callback: (data: unknown) => void): void;
    };
    combat?: Combat | null;
  }

  /** Collection class for documents */
  interface Collection<T> extends Map<string, T> {
    get(id: string): T | undefined;
    filter(predicate: (value: T) => boolean): T[];
    find(predicate: (value: T) => boolean): T | undefined;
    contents: T[];
  }

  /** Dialog options */
  interface DialogOptions {
    title: string;
    content: string;
    buttons: Record<string, {
      label: string;
      callback?: (html: JQuery) => void;
    }>;
    default?: string;
    close?: () => void;
    render?: (html: JQuery) => void;
  }

  /** Dialog class constructor */
  interface DialogConstructor {
    new(options: DialogOptions): Dialog;
    confirm(options: {
      title: string;
      content: string;
      yes?: () => void;
      no?: () => void;
      defaultYes?: boolean;
    }): Promise<boolean>;
  }

  /** Dialog instance */
  interface Dialog {
    render(force?: boolean): this;
    close(): Promise<void>;
  }

  const Dialog: DialogConstructor;

  /** Chat message types constant */
  interface ChatMessageTypes {
    OTHER: number;
    OOC: number;
    IC: number;
    EMOTE: number;
    WHISPER: number;
    ROLL: number;
  }

  /** CONST global */
  const CONST: {
    CHAT_MESSAGE_TYPES: ChatMessageTypes;
    TOKEN_DISPOSITIONS: {
      HOSTILE: number;
      NEUTRAL: number;
      FRIENDLY: number;
    };
  };

  /** ChatMessage class */
  interface ChatMessageConstructor {
    create(data: {
      content: string;
      type?: number;
      speaker?: {
        actor?: string;
        token?: string;
        alias?: string;
      };
      whisper?: string[];
      blind?: boolean;
    }): Promise<ChatMessage>;
  }

  interface ChatMessage {
    id: string;
    content: string;
    type: number;
    speaker: {
      actor?: string;
      token?: string;
      alias?: string;
    };
  }

  const ChatMessage: ChatMessageConstructor;

  /** Item document */
  interface Item {
    id: string;
    _id: string;
    name: string;
    type: string;
    img?: string;
    system: {
      description?: string;
      moveType?: string;
      equipmentType?: string;
      [key: string]: unknown;
    };
    getRollData(): Record<string, unknown>;
    update(data: object, context?: object): Promise<this>;
  }

  /** TextEditor global */
  interface TextEditorGlobal {
    enrichHTML(content: string, options?: {
      secrets?: boolean;
      rollData?: Record<string, unknown>;
      relativeTo?: Item | Actor;
      async?: boolean;
    }): Promise<string>;
  }

  const TextEditor: TextEditorGlobal;

  /** foundry.documents namespace */
  const foundry: {
    utils: FoundryUtils;
    documents: {
      BaseItem: {
        DEFAULT_ICON: string;
      };
    };
  };

  /** Playbook reference */
  interface PlaybookReference {
    name?: string;
    uuid?: string;
  }

  /** Label stat structure */
  interface LabelStatData {
    value: number;
    label?: string;
    min?: number;
    max?: number;
  }

  /** Masks character system data */
  interface MasksCharacterSystemData {
    stats: Record<LabelKey, LabelStatData>;
    playbook?: PlaybookReference;
    attributes: {
      conditions?: {
        options: Record<number, { value: boolean; label?: string }>;
      };
      hp?: { value: number; max?: number };
      xp?: { value: number; max?: number };
      theSoldier?: { value: number };
    };
  }

  /** Actor base type - extended for Masks */
  interface Actor {
    id: string;
    name: string;
    type: string;
    system: MasksCharacterSystemData;
    flags: Record<string, Record<string, unknown>>;
    getFlag<T = unknown>(namespace: string, key: string): T | undefined;
    setFlag(namespace: string, key: string, value: unknown): Promise<this>;
    unsetFlag(namespace: string, key: string): Promise<this>;
    update(data: object, context?: object): Promise<this>;
  }

  /** Combat document */
  interface Combat {
    id: string;
    round: number;
    turn: number;
    combatants: Collection<Combatant>;
    started: boolean;
  }

  /** Combatant in combat */
  interface Combatant {
    id: string;
    actorId: string;
    actor?: Actor;
    token?: Token;
    initiative?: number;
  }

  /** Token on canvas */
  interface Token {
    id: string;
    name: string;
    actor?: Actor;
    document: TokenDocument;
  }

  /** Token document */
  interface TokenDocument {
    id: string;
    name: string;
    actorId?: string;
  }

  /** Hooks global */
  interface HooksGlobal {
    on(hook: string, callback: (...args: unknown[]) => void): number;
    once(hook: string, callback: (...args: unknown[]) => void): number;
    off(hook: string, id: number): void;
    call(hook: string, ...args: unknown[]): boolean;
    callAll(hook: string, ...args: unknown[]): boolean;
  }

  const Hooks: HooksGlobal;
  const game: GameGlobal;
  const ui: UINamespace;
  const canvas: {
    tokens?: {
      placeables: Token[];
      get(id: string): Token | undefined;
    };
    ready: boolean;
  };
}

export {};
