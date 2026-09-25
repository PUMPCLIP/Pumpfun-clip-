import pg from 'pg';
const [operation,id,outcome]=process.argv.slice(2);
if(!['list','resolve'].includes(operation)){console.error('Usage: node scripts/reports.mjs list | resolve REPORT_ID reviewed|dismissed');process.exit(2);}
const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
try{
 if(operation==='list'){
  const r=await db.query("SELECT r.id,r.created_at,r.reason,r.state,r.submission_id,s.campaign_id,s.state AS submission_state FROM content_reports r JOIN submissions s ON s.id=r.submission_id WHERE r.state='open' ORDER BY r.created_at LIMIT 100");console.log(JSON.stringify(r.rows,null,2));
 }else{
  if(!/^[0-9a-f-]{36}$/i.test(id||'')||!['reviewed','dismissed'].includes(outcome)){console.error('Specify report UUID and reviewed|dismissed');process.exitCode=2;}
  else{
   const r=await db.query("UPDATE content_reports SET state=$2 WHERE id=$1 AND state='open' RETURNING id,submission_id,state",[id,outcome]);
   if(!r.rows.length){console.error('Open report not found');process.exitCode=1;}else{await db.query("INSERT INTO audit_events(action,subject_type,subject_id,detail) VALUES('content_report.resolved','content_report',$1,$2)",[id,JSON.stringify({outcome})]);console.log(JSON.stringify(r.rows[0]));}
  }
 }
}finally{await db.end();}
