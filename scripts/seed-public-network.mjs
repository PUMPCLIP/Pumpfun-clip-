import pg from 'pg';

const databaseUrl=process.env.DATABASE_URL||'';
if(!databaseUrl)throw new Error('DATABASE_URL is required for the public network seed');
const ssl=process.env.DATABASE_SSL==='disable'?undefined:{rejectUnauthorized:false};
const client=new pg.Client({connectionString:databaseUrl,ssl,connectionTimeoutMillis:15000});

const creators=[
  {legacy:'pumpclip-public-official',sub:'pumpclip-creator-rakai',name:'Rakai',handle:'2xRaKai',links:{youtube:'https://www.youtube.com/@2xRaKai',tiktok:'https://www.tiktok.com/@2xRaKai',twitch:'https://www.twitch.tv/2xRaKai'}},
  {legacy:'pumpclip-demo-creator',sub:'pumpclip-creator-plaque-boy-max',name:'PlaqueBoyMax',handle:'PlaqueBoyMax',links:{youtube:'https://www.youtube.com/@PlaqueBoyMax',tiktok:'https://www.tiktok.com/@PlaqueBoyMax',twitch:'https://www.twitch.tv/PlaqueBoyMax'}},
  {sub:'pumpclip-creator-jasontheween',name:'Jasontheween',handle:'jasontheween',links:{youtube:'https://www.youtube.com/@jasontheween',tiktok:'https://www.tiktok.com/@jasontheween',twitch:'https://www.twitch.tv/jasontheween'}},
  {sub:'pumpclip-creator-clavicular',name:'Clavicular',handle:'Clavicular',links:{youtube:'https://www.youtube.com/@Clavicular',tiktok:'https://www.tiktok.com/@Clavicular',kick:'https://kick.com/Clavicular'}},
  {sub:'pumpclip-creator-theburntpeanut',name:'TheBurntPeanut',handle:'TheBurntPeanut',links:{youtube:'https://www.youtube.com/@TheBurntPeanut',tiktok:'https://www.tiktok.com/@TheBurntPeanut',twitch:'https://www.twitch.tv/TheBurntPeanut'}},
  {sub:'pumpclip-creator-jynxzi',name:'Jynxzi',handle:'Jynxzi',links:{youtube:'https://www.youtube.com/@Jynxzi',tiktok:'https://www.tiktok.com/@Jynxzi',twitch:'https://www.twitch.tv/jynxzi'}},
  {sub:'pumpclip-creator-sketch',name:'Sketch',handle:'TheSketchReal',links:{youtube:'https://www.youtube.com/@TheSketchReal',tiktok:'https://www.tiktok.com/@sketch',twitch:'https://www.twitch.tv/sketch'}},
  {sub:'pumpclip-creator-marlon',name:'Marlon',handle:'Marlon',links:{youtube:'https://www.youtube.com/@Marlon',tiktok:'https://www.tiktok.com/@marlon',twitch:'https://www.twitch.tv/Marlon'}},
  {sub:'pumpclip-creator-tsukilin',name:'Tsukilin',handle:'Tsukilin',links:{youtube:'https://www.youtube.com/@Tsukilin',tiktok:'https://www.tiktok.com/@tsukilin',twitch:'https://www.twitch.tv/Tsukilin'}},
  {sub:'pumpclip-creator-neuro-sama-vedal',name:'Neuro-sama / Vedal',handle:'vedal987',links:{youtube:'https://www.youtube.com/@vedal987',tiktok:'https://www.tiktok.com/@neurosama',twitch:'https://www.twitch.tv/vedal987'}},
];

async function upsertCreator(creator){
  const email=`${creator.sub}@pumpclip.app`;
  const result=await client.query(`INSERT INTO users(google_sub,email,display_name,roles,public_handle,social_links)
    VALUES($1,$2,$3,ARRAY['streamer','clipper'],$4,$5)
    ON CONFLICT(google_sub) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,
      roles=EXCLUDED.roles,public_handle=EXCLUDED.public_handle,social_links=EXCLUDED.social_links,updated_at=now()
    RETURNING id`,[creator.legacy||creator.sub,email,creator.name,creator.handle,JSON.stringify(creator.links)]);
  return result.rows[0].id;
}
async function upsertCampaign(streamerId,title,description,sourceUrl){
  const found=await client.query('SELECT id FROM campaigns WHERE streamer_id=$1 AND title=$2 LIMIT 1',[streamerId,title]);
  if(found.rowCount){await client.query(`UPDATE campaigns SET category='Pump.fun Content',description=$3,source_url=$4,state='live',target_platforms=$5,updated_at=now() WHERE id=$1 AND streamer_id=$2`,[found.rows[0].id,streamerId,description,sourceUrl,['tiktok','youtube','instagram','x']]);return found.rows[0].id;}
  const result=await client.query(`INSERT INTO campaigns(streamer_id,title,description,category,source_url,target_platforms,state,start_at)
    VALUES($1,$2,$3,'Pump.fun Content',$4,$5,'live',now()) RETURNING id`,[streamerId,title,description,sourceUrl,['tiktok','youtube','instagram','x']]);
  return result.rows[0].id;
}

try{
  await client.connect();
  const ids=[];
  for(const creator of creators)ids.push(await upsertCreator(creator));
  const campaigns=[];
  for(const [index,id] of ids.entries()){
    if(index>2)continue;
    campaigns.push(await upsertCampaign(id,`${creators[index].name} · Pump.fun Live Cuts`,`Clip and promote licensed highlights from ${creators[index].name}'s Pump.fun livestream content.`,'https://pump.fun/live'));
  }
  console.log(JSON.stringify({seeded:true,profiles:creators.length,campaigns:campaigns.length,category:'Pump.fun Content'}));
}finally{await client.end().catch(()=>{});}
