const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({limit:'1mb'}));

const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-this-admin-key';
const INGEST_KEY = process.env.INGEST_KEY || '';
const clients = new Set();
const state = {
  settings:{aiEnabled:true, memoryEnabled:true, faqSearchEnabled:true, salesAssistantEnabled:true, banglaSupport:true, humanHandoffEnabled:true, faqConfidence:0.78},
  conversations:[], unanswered:[], feedback:[], leads:[], events:[],
  health:{ai:'online', googleSheets:'online', facebook:'online', storage:'online', updatedAt:new Date().toISOString()}
};

function seed(){
  const c1={id:uuidv4(),customerName:'Rahim',customerId:'demo-001',status:'AI_ACTIVE',lastActivity:new Date().toISOString(),messages:[
    {id:uuidv4(),role:'user',content:'iPhone 15 er price koto?',time:new Date(Date.now()-600000).toISOString()},
    {id:uuidv4(),role:'assistant',content:'আমি বর্তমান ব্যবসায়িক তথ্য যাচাই করে জানাচ্ছি।',time:new Date(Date.now()-590000).toISOString()}
  ]};
  const c2={id:uuidv4(),customerName:'Karim',customerId:'demo-002',status:'HANDOFF_REQUIRED',lastActivity:new Date().toISOString(),messages:[
    {id:uuidv4(),role:'user',content:'আমি একজন মানুষের সাথে কথা বলতে চাই।',time:new Date(Date.now()-300000).toISOString()}
  ]};
  state.conversations.push(c1,c2);
  state.unanswered.push({id:uuidv4(),conversationId:c1.id,customerName:'Rahim',question:'আপনাদের exchange policy কী?',status:'NEW',confidence:0.21,createdAt:new Date().toISOString()});
}
seed();

function auth(req,res,next){
  if(req.path==='/health' || req.path==='/events/stream' || req.path==='/ingest') return next();
  const key=req.headers['x-admin-key'];
  if(key!==ADMIN_KEY) return res.status(401).json({error:'Unauthorized'});
  next();
}
app.use('/api',auth);

function ingestAuth(req,res,next){
  if(INGEST_KEY && req.headers['x-ingest-key']!==INGEST_KEY) return res.status(401).json({error:'Invalid ingest key'});
  next();
}

function emit(type,data){ const payload=`data: ${JSON.stringify({type,data})}\n\n`; for(const r of clients){try{r.write(payload)}catch{clients.delete(r)}} }
function addEvent(type,data){state.events.unshift({id:uuidv4(),type,data,time:new Date().toISOString()}); state.events=state.events.slice(0,500); emit(type,data);}

app.get('/api/health',(req,res)=>res.json({...state.health, updatedAt:new Date().toISOString()}));
app.get('/api/auth/check',(req,res)=>res.json({ok:true}));
app.get('/api/events/stream',(req,res)=>{res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');res.flushHeaders?.();clients.add(res);res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`);req.on('close',()=>clients.delete(res));});

app.get('/api/overview',(req,res)=>{
  const conv=state.conversations; const totalMsgs=conv.reduce((n,c)=>n+c.messages.length,0);
  res.json({stats:{conversations:conv.length,activeCustomers:new Set(conv.map(c=>c.customerId)).size,aiResponses:conv.reduce((n,c)=>n+c.messages.filter(m=>m.role==='assistant').length,0),humanHandled:conv.filter(c=>c.status==='HUMAN_ACTIVE').length,unanswered:state.unanswered.filter(x=>x.status==='NEW').length,handoffs:conv.filter(c=>c.status==='HANDOFF_REQUIRED').length,leads:state.leads.length,totalMessages:totalMsgs},recentEvents:state.events.slice(0,12)});
});
app.get('/api/conversations',(req,res)=>res.json(state.conversations));
app.get('/api/conversations/:id',(req,res)=>{const c=state.conversations.find(x=>x.id===req.params.id); if(!c)return res.status(404).json({error:'Not found'});res.json(c)});
app.post('/api/conversations/:id/mode',(req,res)=>{const c=state.conversations.find(x=>x.id===req.params.id); if(!c)return res.status(404).json({error:'Not found'}); const mode=req.body.mode; if(!['AI_ACTIVE','HUMAN_ACTIVE','HANDOFF_REQUIRED','CLOSED'].includes(mode))return res.status(400).json({error:'Invalid mode'});c.status=mode;c.lastActivity=new Date().toISOString();addEvent('conversation_mode',{conversationId:c.id,mode});res.json(c)});
app.post('/api/conversations/:id/reply',(req,res)=>{const c=state.conversations.find(x=>x.id===req.params.id);if(!c)return res.status(404).json({error:'Not found'});if(c.status!=='HUMAN_ACTIVE')return res.status(409).json({error:'Conversation is not in HUMAN_ACTIVE mode'});const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'Message required'});c.messages.push({id:uuidv4(),role:'human',content:text,time:new Date().toISOString()});c.lastActivity=new Date().toISOString();addEvent('human_reply',{conversationId:c.id,text});res.json(c)});
app.get('/api/unanswered',(req,res)=>res.json(state.unanswered));
app.post('/api/unanswered/:id/status',(req,res)=>{const x=state.unanswered.find(x=>x.id===req.params.id);if(!x)return res.status(404).json({error:'Not found'});x.status=req.body.status;addEvent('unanswered_status',{id:x.id,status:x.status});res.json(x)});
app.get('/api/feedback',(req,res)=>res.json(state.feedback));
app.post('/api/feedback',(req,res)=>{const item={id:uuidv4(),...req.body,createdAt:new Date().toISOString()};state.feedback.unshift(item);addEvent('feedback',item);res.json(item)});
app.get('/api/leads',(req,res)=>res.json(state.leads));
app.post('/api/leads',(req,res)=>{const item={id:uuidv4(),status:'NEW',createdAt:new Date().toISOString(),...req.body};state.leads.unshift(item);addEvent('lead',item);res.json(item)});
app.get('/api/settings',(req,res)=>res.json(state.settings));
app.put('/api/settings',(req,res)=>{state.settings={...state.settings,...req.body};addEvent('settings_changed',state.settings);res.json(state.settings)});

// Existing chatbot/Facebook backend can POST normalized events here.
app.post('/api/ingest',ingestAuth,(req,res)=>{
  const e=req.body||{}; if(!e.customerId||!e.type)return res.status(400).json({error:'customerId and type required'});
  let c=state.conversations.find(x=>x.customerId===e.customerId);
  if(!c){c={id:uuidv4(),customerName:e.customerName||'Unknown customer',customerId:e.customerId,status:'AI_ACTIVE',lastActivity:new Date().toISOString(),messages:[]};state.conversations.unshift(c)}
  const role=e.type==='human_reply'?'human':(e.role||'user');
  if(e.content)c.messages.push({id:e.messageId||uuidv4(),role,content:e.content,time:e.time||new Date().toISOString(),type:e.eventType||e.type});
  c.lastActivity=new Date().toISOString();
  if(e.unanswered){state.unanswered.unshift({id:uuidv4(),conversationId:c.id,customerName:c.customerName,question:e.content||'',status:'NEW',confidence:e.confidence??0,createdAt:new Date().toISOString()})}
  if(e.handoff)c.status='HANDOFF_REQUIRED';
  addEvent('message', {conversationId:c.id,customerId:c.customerId}); res.json({ok:true,conversationId:c.id});
});

const clientDist=path.join(__dirname,'..','client','dist');
if(require('fs').existsSync(clientDist)){
  app.use(express.static(clientDist));
  app.use((req,res,next)=>{
    if(req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist,'index.html'));
  });
}
app.listen(PORT,()=>console.log(`Admin server running on http://localhost:${PORT}`));
