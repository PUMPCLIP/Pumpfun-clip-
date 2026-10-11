export type CreatorSocial = {
  label: 'X' | 'Twitch';
  handle: string;
  url: string;
};

export type FeaturedCreator = {
  slug: string;
  name: string;
  role: string;
  initials: string;
  accent: 'lime' | 'violet';
  socials: CreatorSocial[];
  referenceVideo?: {
    title: string;
    url: string;
    youtubeId: string;
  };
};

export const FEATURED_CREATORS: FeaturedCreator[] = [
  {
    slug: 'threadguy',
    name: 'Threadguy',
    role: 'Crypto Streamer & Host',
    initials: 'TG',
    accent: 'lime',
    socials: [
      {label: 'X', handle: '@notthreadguy', url: 'https://x.com/notthreadguy'},
      {label: 'Twitch', handle: 'twitch.tv/threadguy', url: 'https://twitch.tv/threadguy'},
    ],
    referenceVideo: {
      title: 'The Ansem Interview',
      url: 'https://www.youtube.com/watch?v=r1dkV28CCcw',
      youtubeId: 'r1dkV28CCcw',
    },
  },
  {
    slug: 'ansem',
    name: 'Ansem',
    role: 'Solana Market Trader & Streamer',
    initials: 'AN',
    accent: 'violet',
    socials: [
      {label: 'X', handle: '@blknoiz06', url: 'https://x.com/blknoiz06'},
    ],
  },
];

export const THREADGUY = FEATURED_CREATORS[0];
export const ANSEM = FEATURED_CREATORS[1];
