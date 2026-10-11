export type DemoClipCategory='crypto'|'gaming-irl'|'speed-kai'|'pokimane-amouranth';
export type DemoClip={
  slug:string;
  name:string;
  legalName:string;
  role:string;
  category:DemoClipCategory;
  categoryLabel:string;
  embedUrl:string;
  aspectRatio:'9:16';
  duration:string;
  initials:string;
  accent:'lime'|'violet'|'blue'|'amber';
  caption:string[];
  socialUrl:string;
  socialLabel:string;
};

export const DEMO_CLIPS:DemoClip[]=[
  {slug:'pokimane',name:'Pokimane',legalName:'Imane Anys',role:'Variety & Reaction Streamer',category:'gaming-irl',categoryLabel:'Gaming / IRL',embedUrl:'https://www.youtube.com/embed/bZwEbzllE8c?autoplay=1&mute=1&loop=1&playlist=bZwEbzllE8c',aspectRatio:'9:16',duration:'00:52',initials:'P',accent:'violet',caption:['Wait, this is actually','the wildest take','I have heard today.'],socialUrl:'https://www.youtube.com/@pokimane',socialLabel:'YouTube'},
  {slug:'amouranth',name:'Amouranth',legalName:'Kaitlyn Siragusa',role:'IRL & Live Stream Creator',category:'gaming-irl',categoryLabel:'Gaming / IRL',embedUrl:'https://www.youtube.com/embed/EJV-EZSDhJk?autoplay=1&mute=1&loop=1&playlist=EJV-EZSDhJk',aspectRatio:'9:16',duration:'00:45',initials:'A',accent:'amber',caption:['The chat is moving','way too fast','right now.'],socialUrl:'https://www.youtube.com/@Amouranth',socialLabel:'YouTube'},
  {slug:'layah-heilpern',name:'Layah Heilpern',legalName:'Layah Heilpern',role:'Crypto & Web3 Media Host',category:'crypto',categoryLabel:'Crypto',embedUrl:'https://www.youtube.com/embed/r1dkV28CCcw?autoplay=1&mute=1&loop=1&playlist=r1dkV28CCcw',aspectRatio:'9:16',duration:'01:10',initials:'LH',accent:'lime',caption:['The signal is not','in the noise.','It is in the conviction.'],socialUrl:'https://x.com/layahheilpern',socialLabel:'X'},
  {slug:'ishowspeed',name:'IShowSpeed',legalName:'Darren Watkins Jr.',role:'Live Stream Reactions',category:'gaming-irl',categoryLabel:'Gaming / IRL',embedUrl:'https://www.youtube.com/embed/VO2VFCEv_Fg?autoplay=1&mute=1&loop=1&playlist=VO2VFCEv_Fg',aspectRatio:'9:16',duration:'01:12',initials:'IS',accent:'blue',caption:['No way they just','did that on stream!','That is crazy!'],socialUrl:'https://www.youtube.com/@IShowSpeed',socialLabel:'YouTube'},
  {slug:'kai-cenat',name:'Kai Cenat',legalName:'Kai Cenat',role:'AMP Stream Highlights',category:'gaming-irl',categoryLabel:'Gaming / IRL',embedUrl:'https://www.youtube.com/embed/J6g894SCnLE?autoplay=1&mute=1&loop=1&playlist=J6g894SCnLE',aspectRatio:'9:16',duration:'00:48',initials:'KC',accent:'amber',caption:['AMP is outside','and the energy','is already different.'],socialUrl:'https://www.youtube.com/@KaiCenatLive',socialLabel:'YouTube'},
  {slug:'threadguy',name:'Threadguy',legalName:'Threadguy',role:'Crypto Streamer & Host',category:'crypto',categoryLabel:'Crypto',embedUrl:'https://www.youtube.com/embed/r1dkV28CCcw?autoplay=1&mute=1&loop=1&playlist=r1dkV28CCcw',aspectRatio:'9:16',duration:'01:10',initials:'TG',accent:'lime',caption:['This is the moment','the whole timeline','starts paying attention.'],socialUrl:'https://x.com/notthreadguy',socialLabel:'X'},
];

export const DEMO_CATEGORIES:Array<{key:'all'|'crypto'|'gaming-irl'|'speed-kai'|'pokimane-amouranth';label:string}> = [
  {key:'all',label:'All'},
  {key:'crypto',label:'Crypto'},
  {key:'gaming-irl',label:'Gaming / IRL'},
  {key:'speed-kai',label:'IShowSpeed & Kai'},
  {key:'pokimane-amouranth',label:'Pokimane & Amouranth'},
];
