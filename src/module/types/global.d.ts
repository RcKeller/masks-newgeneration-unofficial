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
}

export {};
