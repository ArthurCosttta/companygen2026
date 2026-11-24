export interface ShowcaseStoreSeed {
  accessCode: string;
  userId: string;
  credits: number;
  publicSlug: string;
  profile: Record<string, any>;
}

export declare const FIVE_SHOWCASE_STORES: ShowcaseStoreSeed[];
