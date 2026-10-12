import {CREATOR_SPOTLIGHTS, type CreatorSpotlight, type CreatorSpotlightCategory} from '@/lib/creator-spotlights';

export type DemoClip = {
  slug: string;
  name: string;
  role: string;
  category: CreatorSpotlightCategory;
  categoryLabel: string;
  embedUrl: string;
  aspectRatio: '9:16';
  duration: string;
  initials: string;
  accent: 'lime' | 'violet' | 'blue' | 'amber';
  socialUrl: string;
  socialLabel: string;
  videoId: string;
  thumbnailUrl?: string;
  clipTitle: string;
};

const categoryLabels: Record<CreatorSpotlightCategory, string> = {
  fashion: 'Fashion',
  beauty: 'Beauty',
  lifestyle: 'Lifestyle',
  streaming: 'Live & gaming',
  finance: 'Finance',
};

const categoryAccents: Record<CreatorSpotlightCategory, DemoClip['accent']> = {
  fashion: 'amber',
  beauty: 'violet',
  lifestyle: 'blue',
  streaming: 'lime',
  finance: 'lime',
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function embedUrl(creator: CreatorSpotlight) {
  const id = encodeURIComponent(creator.videoId);
  if (creator.videoProvider === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`;
  if (creator.videoProvider === 'tiktok') return `https://www.tiktok.com/player/v1/${id}?controls=1&autoplay=0`;
  return `https://www.instagram.com/reel/${id}/embed/`;
}

export const DEMO_CLIPS: DemoClip[] = CREATOR_SPOTLIGHTS.map(creator => ({
  slug: creator.slug,
  name: creator.name,
  role: creator.role,
  category: creator.category,
  categoryLabel: categoryLabels[creator.category],
  embedUrl: embedUrl(creator),
  aspectRatio: '9:16',
  duration: 'PUBLIC',
  initials: initials(creator.name),
  accent: categoryAccents[creator.category],
  socialUrl: creator.profileUrl,
  socialLabel: creator.videoProvider.toUpperCase(),
  videoId: creator.videoId,
  thumbnailUrl: creator.thumbnailUrl,
  clipTitle: creator.clipTitle,
}));

export const DEMO_CATEGORIES: Array<{key: 'all' | CreatorSpotlightCategory; label: string}> = [
  {key: 'all', label: 'All'},
  {key: 'fashion', label: 'Fashion'},
  {key: 'beauty', label: 'Beauty'},
  {key: 'lifestyle', label: 'Lifestyle'},
  {key: 'streaming', label: 'Live & gaming'},
  {key: 'finance', label: 'Finance'},
];
