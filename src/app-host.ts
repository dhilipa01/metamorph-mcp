// GET /app : a browser host for the MCP tools and the real score-dashboard widget. It is only a host: the widget HTML
// comes from the MCP resource ui://widget/next-score-dashboard.html (resources/read over POST /mcp) and runs in a
// sandboxed iframe (no allow-same-origin). The key lives in one JS variable in this tab and is sent only to /mcp.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOGO_D64 } from './landing-logo.js';
import { TOOLS, escapeHtml } from './landing.js';

export const WIDGET_URI = 'ui://widget/next-score-dashboard.html';

// ---- pure host logic. Kept as source text so the browser runs exactly what the unit tests run. ----
export const LOGIC = `
function parseRpc(text){
  if(typeof text!=='string')return null;
  var t=text.trim();
  if(!t)return null;
  if(t.charAt(0)==='{'){try{return JSON.parse(t)}catch(e){return null}}
  var out=null,lines=t.split(/\\r?\\n/);
  for(var i=0;i<lines.length;i++){
    var l=lines[i];
    if(l.indexOf('data:')!==0)continue;
    try{var o=JSON.parse(l.slice(5).trim());if(o&&typeof o==='object'&&('result' in o||'error' in o))out=o}catch(e){}
  }
  return out;
}
function allowedExternal(url,origin){
  if(typeof url!=='string'||url.length>2000)return false;
  var u;try{u=new URL(url,origin)}catch(e){return false}
  if(u.username||u.password)return false;
  if(u.origin===origin)return u.pathname.indexOf('/reports/')===0;
  return u.protocol==='https:';
}
function callPolicy(name,from,canWrite,tools){
  if(typeof name!=='string'||!Object.prototype.hasOwnProperty.call(tools,name))return{ok:false,error:'Unknown tool.'};
  if(tools[name]==='write'){
    if(from!=='host')return{ok:false,error:'The widget may not run tools that need write scope. Use the host button.'};
    if(!canWrite)return{ok:false,error:'This tool needs write scope. Ask the owner for a key with write scope.'};
  }
  return{ok:true};
}
function cleanArgs(a){
  if(!a||typeof a!=='object'||Array.isArray(a))return{};
  var o={};
  for(var k in a){if(Object.prototype.hasOwnProperty.call(a,k)&&/^[a-z_]{1,40}$/.test(k)){var v=a[k];if(typeof v==='string'||typeof v==='boolean'||typeof v==='number')o[k]=v}}
  return o;
}
function decide(ev,ctx){
  if(!ev||!ctx.frameWindow||ev.source!==ctx.frameWindow)return{act:'ignore'};
  var d=ev.data;
  if(!d||typeof d!=='object'||d.src!=='mm-widget')return{act:'ignore'};
  switch(d.t){
    case'ready':return{act:'ready'};
    case'theme':return{act:'theme'};
    case'fullscreen':return{act:'fullscreen'};
    case'openExternal':return allowedExternal(d.url,ctx.origin)?{act:'open',url:new URL(d.url,ctx.origin).href}:{act:'ignore'};
    case'callTool':{
      var id=typeof d.id==='number'?d.id:0;
      var p=callPolicy(d.name,'widget',ctx.canWrite,ctx.tools);
      if(!p.ok)return{act:'deny',id:id,error:p.error};
      return{act:'call',id:id,name:d.name,args:cleanArgs(d.args)};
    }
  }
  return{act:'ignore'};
}
`;

// Runs inside the iframe: the window.openai surface the widget expects (same shape as scripts/widget_shots.py), with
// callTool/openExternal/requestDisplayMode forwarded to the host by postMessage.
export const SHIM = `(function(){var p=window.parent,n=0,pend={};var o=window.openai={toolOutput:null,theme:'light',displayMode:'fullscreen',locale:'en',maxHeight:null,callTool:function(name,args){return new Promise(function(res,rej){var id=++n;pend[id]=[res,rej];p.postMessage({src:'mm-widget',t:'callTool',id:id,name:name,args:args||{}},'*')})},openExternal:function(a){p.postMessage({src:'mm-widget',t:'openExternal',url:a&&a.href},'*')},requestDisplayMode:function(){p.postMessage({src:'mm-widget',t:'fullscreen'},'*');return Promise.resolve()},requestClose:function(){},setWidgetState:function(){return Promise.resolve()},sendFollowUpMessage:function(){return Promise.resolve()}};window.addEventListener('message',function(e){if(e.source!==p)return;var d=e.data;if(!d||typeof d!=='object')return;if(d.type==='NITRO_INJECT_OPENAI'&&d.data){for(var k in d.data)o[k]=d.data[k];window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:d.data}}))}else if(d.type==='mm-result'){var q=pend[d.id];delete pend[d.id];if(q){if(d.error)q[1](new Error(d.error));else q[0](d.result)}}});window.dispatchEvent(new Event('openai:ready'));p.postMessage({src:'mm-widget',t:'ready'},'*')})();`;

const toolScopes = Object.fromEntries(TOOLS.map((t) => [t.name, t.scope]));

const CSS = `
:root{--bg:#D5DAD0;--card:#EFE7D6;--ink:#1B1D19;--mute:#555A50;--accent:#6B1F2A;--onacc:#EFE7D6;--line:#1B1D1933;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#151614;--card:#1E3527;--ink:#ECE9DF;--mute:#A9AFA2;--accent:#D1344A;--onacc:#151614;--line:#ECE9DF33;color-scheme:dark}}
:root[data-theme=dark]{--bg:#151614;--card:#1E3527;--ink:#ECE9DF;--mute:#A9AFA2;--accent:#D1344A;--onacc:#151614;--line:#ECE9DF33;color-scheme:dark}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 "Helvetica Neue",Helvetica,Arial,"Liberation Sans",system-ui,sans-serif;display:grid;grid-template-columns:320px 1fr;grid-template-rows:1fr auto}
aside{background:var(--card);padding:20px 20px 16px;overflow:auto;display:flex;flex-direction:column;gap:14px;border-right:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:12px}
svg.logo{width:44px;height:44px;color:var(--accent);flex:none}
h1{font:700 26px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:-.02em;margin:0}
.sub{font-size:12px;color:var(--mute);margin:2px 0 0}
.f{margin-top:10px}
label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);font-weight:700;margin-bottom:3px}
input,select{width:100%;font:inherit;font-size:14px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:7px 9px}
input:focus,select:focus,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.note{font-size:12px;color:var(--mute);margin:4px 0 0}
button{font:inherit;font-size:14px;color:var(--ink);background:none;border:1px solid var(--line);border-radius:4px;padding:7px 12px;cursor:pointer}
button:disabled{opacity:.45;cursor:not-allowed}
button.primary{background:var(--accent);color:var(--onacc);border-color:var(--accent);font-weight:700;width:100%;padding:10px 12px}
button.link{border:0;padding:0;font-size:12px;color:var(--accent);text-decoration:underline}
ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
li button{width:100%;text-align:left;display:flex;gap:10px;align-items:baseline}
li .n{font-family:Georgia,"Times New Roman",serif;font-size:18px;width:18px;color:var(--accent)}
li.next button{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
li.done .n{text-decoration:underline}
li .h{font-size:11px;color:var(--mute);margin-left:auto}
.bar{display:flex;gap:8px;align-items:center;justify-content:space-between}
.bar a{font-size:12px;color:var(--accent)}
.foot{margin-top:auto}
main{position:relative;min-width:0;min-height:0}
iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg)}
#empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mute);text-align:center;padding:24px;font-size:17px}
#busy{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(128,128,128,.25);font-size:17px;font-weight:700}
#busy.on{display:flex}
#status{grid-column:1/3;padding:8px 20px;border-top:1px solid var(--line);background:var(--card);font-size:13px;min-height:36px}
#status.err{color:var(--accent);font-weight:700}
@media (max-width:760px){body{grid-template-columns:1fr;grid-template-rows:auto 70vh auto}#status{grid-column:1}}
`.trim();

// The page script. Only DOM text (textContent) is ever written from server data.
const JS = `(function(){
${LOGIC}
var TOOLS=${JSON.stringify(toolScopes)};
var WIDGET=${JSON.stringify(WIDGET_URI)};
var SHIM=${JSON.stringify(SHIM)};
var origin=location.origin;
var key='';var sid='';var rid=0;var canWrite=false;var pending=null;var busy=false;var inited=false;
var last={};var done={};
var $=function(i){return document.getElementById(i)};
var root=document.documentElement,frame=null,main=$('main'),status=$('status');
var GH=/^https:\\/\\/github\\.com\\/[^\\/\\s]+\\/[^\\/\\s]+/;
function say(t,err){status.textContent=t;status.className=err?'err':''}
function dark(){var t=root.getAttribute('data-theme');return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches}
function themeName(){return dark()?'dark':'light'}
function inputs(){return{repo:$('repo').value.trim(),sub:$('sub').value.trim(),goal:$('goal').value}}
function ready(){return key.length>=8&&GH.test(inputs().repo)&&!busy}
function refresh(){
  var r=ready();
  $('run').disabled=!r;
  var order=['assess','plan','preview','report'],nx=-1;
  for(var i=0;i<order.length;i++){if(!done[order[i]]){nx=i;break}}
  order.forEach(function(s,i){var li=$('s-'+s);li.className=(done[s]?'done ':'')+(i===nx?'next':'');li.firstChild.disabled=!r||(s!=='assess'&&!done.assess)});
  $('s-apply').firstChild.disabled=!(r&&canWrite&&last.preview&&last.preview.approvalToken);
  $('hint').textContent=key.length<8?'Paste your API key to enable the buttons.':(GH.test(inputs().repo)?'':'Enter a public GitHub repository URL.');
}
function post(body){
  var h={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};
  if(key)h['Authorization']='Bearer '+key;
  if(sid)h['mcp-session-id']=sid;
  return fetch('/mcp',{method:'POST',headers:h,body:JSON.stringify(body),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}).then(function(r){
    var s=r.headers.get('mcp-session-id');if(s)sid=s;
    return r.text().then(function(t){
      var o=parseRpc(t);
      if(!r.ok&&!o){var m=t.trim().slice(0,300);throw new Error(m||('HTTP '+r.status))}
      return o;
    });
  });
}
function rpc(method,params){
  return post({jsonrpc:'2.0',id:++rid,method:method,params:params||{}}).then(function(x){
    if(!x)throw new Error('Empty reply from the server.');
    if(x.error)throw new Error(String(x.error.message||'Request failed').slice(0,400));
    return x.result;
  });
}
function init(){
  if(inited)return Promise.resolve();
  return rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'metamorph-browser-host',version:'1'}}).then(function(){
    inited=true;
    return post({jsonrpc:'2.0',method:'notifications/initialized'}).catch(function(){});
  });
}
function textOf(res){
  var c=res&&res.content;if(!Array.isArray(c))return'';
  return c.filter(function(x){return x&&x.type==='text'&&typeof x.text==='string'}).map(function(x){return x.text}).join(' ').slice(0,400);
}
function outputOf(res){
  if(res&&res.structuredContent)return res.structuredContent;
  try{return JSON.parse(textOf(res))}catch(e){return null}
}
function callTool(name,args,from){
  var p=callPolicy(name,from,canWrite,TOOLS);
  if(!p.ok)return Promise.reject(new Error(p.error));
  return init().then(function(){return rpc('tools/call',{name:name,arguments:args})}).then(function(res){
    if(res&&res.isError)throw new Error(textOf(res)||'The tool returned an error.');
    return res;
  });
}
function setBusy(on,msg){busy=on;$('busy').className=on?'on':'';if(msg)say(msg);refresh()}
function send(msg){if(frame&&frame.contentWindow)frame.contentWindow.postMessage(msg,'*')}
function inject(out){
  pending=out;
  send({type:'NITRO_INJECT_OPENAI',data:{toolOutput:out,theme:themeName()}});
}
function mount(){
  if(frame)return Promise.resolve();
  return init().then(function(){return rpc('resources/read',{uri:WIDGET})}).then(function(r){
    var c=r&&r.contents&&r.contents[0];var h=c&&typeof c.text==='string'?c.text:'';
    if(!h)throw new Error('The server returned no widget HTML.');
    var tag='<script>'+SHIM+'<\\/script>';
    frame=document.createElement('iframe');
    frame.setAttribute('sandbox','allow-scripts');
    frame.setAttribute('title','Metamorph score dashboard');
    frame.srcdoc=h.indexOf('<head>')>=0?h.replace('<head>','<head>'+tag):tag+h;
    $('empty').style.display='none';
    main.insertBefore(frame,$('busy'));
  });
}
function firstStage(){return((last.plan&&last.plan.stages)||[]).filter(function(s){return s&&s.automated})[0]}
function run(step){
  var i=inputs();
  var base={repo_url:i.repo};if(i.sub)base.subfolder=i.sub;
  var tool,args,st;
  if(step==='assess'){tool='assess_project';args=base}
  else if(step==='plan'){tool='plan_modernization';args=Object.assign({goal:i.goal},base)}
  else if(step==='preview'){
    st=firstStage();
    if(!st){say('The plan has no automated stage to preview.',true);return}
    tool='preview_changes';args=Object.assign({goal:i.goal,stage:st.id},base);
  }
  else if(step==='report'){tool='generate_report';args=Object.assign({goal:i.goal},base)}
  else{
    st=firstStage();
    if(!st||!last.preview||!last.preview.approvalToken){say('Run Preview first to get an approval token.',true);return}
    tool='apply_stage';args=Object.assign({goal:i.goal,stage:st.id,approval_token:last.preview.approvalToken},base);
  }
  setBusy(true,'Running '+tool+' ...');
  return mount().then(function(){return callTool(tool,args,'host')}).then(function(res){
    var out=outputOf(res);
    last[step]=out;done[step]=true;
    if(step==='assess'&&!canWrite)probe();
    inject(out);
    say('Done: '+tool+'.');
  }).catch(function(e){say(e.message||String(e),true)}).then(function(){setBusy(false)});
}
// A write-scope check without side effects: the scope guard answers before the tool validates its (empty) input.
function probe(){
  rpc('tools/call',{name:'apply_stage',arguments:{}}).then(function(res){
    canWrite=!/needs "write" scope/.test(textOf(res));refresh();
  }).catch(function(e){canWrite=!/write/.test(e.message);refresh()});
}
window.addEventListener('message',function(ev){
  var d=decide(ev,{frameWindow:frame&&frame.contentWindow,origin:origin,tools:TOOLS,canWrite:canWrite});
  switch(d.act){
    case'ready':send({type:'NITRO_INJECT_OPENAI',data:{theme:themeName(),toolOutput:pending}});break;
    case'theme':send({type:'NITRO_INJECT_OPENAI',data:{theme:themeName()}});break;
    case'fullscreen':if(main.requestFullscreen)main.requestFullscreen().catch(function(){});break;
    case'open':window.open(d.url,'_blank','noopener,noreferrer');break;
    case'deny':send({type:'mm-result',id:d.id,error:d.error});say(d.error,true);break;
    case'call':
      setBusy(true,'Running '+d.name+' ...');
      callTool(d.name,d.args,'widget').then(function(res){
        var out=outputOf(res);send({type:'mm-result',id:d.id,result:out});inject(out);
        if(d.name==='preview_changes'){last.preview=out;done.preview=true}
        if(d.name==='plan_modernization'){last.plan=out;done.plan=true}
        say('Done: '+d.name+'.');
      }).catch(function(e){send({type:'mm-result',id:d.id,error:e.message});say(e.message,true)}).then(function(){setBusy(false)});
  }
});
['repo','sub','goal'].forEach(function(i){$(i).addEventListener('input',refresh)});
$('key').addEventListener('input',function(){key=$('key').value;refresh()});
$('forget').addEventListener('click',function(){key='';sid='';inited=false;canWrite=false;$('key').value='';say('Key forgotten.');refresh()});
['plan','preview','report','apply'].forEach(function(s){$('s-'+s).firstChild.addEventListener('click',function(){run(s)})});
$('form').addEventListener('submit',function(e){e.preventDefault();if(ready())run('assess')});
$('theme').addEventListener('click',function(){var n=dark()?'light':'dark';root.setAttribute('data-theme',n);send({type:'NITRO_INJECT_OPENAI',data:{theme:n}})});
refresh();
})();`;

const sha = (s: string) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;

// The widget is served by the SDK from the same bundled file (resources/read). The iframe inherits this page's CSP, so
// the CSP must allow that file's inline scripts and styles: hash them from the file the SDK reads.
export function widgetHashes(cwd: string = process.cwd()): { script: string[]; style: string[] } {
  const file = ['src/widgets/out', 'dist/widgets/out', 'widgets/out'].map((d) => join(cwd, d, 'score-dashboard.html')).find((p) => existsSync(p));
  if (!file) return { script: [], style: [] };
  const html = readFileSync(file, 'utf-8');
  const grab = (tag: string) => [...html.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]).filter((s) => s.length > 0);
  return { script: grab('script').map(sha), style: grab('style').map(sha) };
}

export function appCsp(cwd?: string): string {
  const w = widgetHashes(cwd);
  const script = [sha(JS), sha(SHIM), ...w.script].join(' ');
  const style = [sha(CSS), ...w.style].join(' ');
  return `default-src 'none'; style-src ${style}; script-src ${script}; connect-src 'self'; frame-src 'self' blob:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

export { CSS as APP_CSS, JS as APP_JS };

export function renderApp(): string {
  const e = escapeHtml;
  const step = (id: string, n: number, label: string, hint = '') => `<li id="s-${id}"><button type="button"><span class="n">${n}</span>${e(label)}<span class="h">${e(hint)}</span></button></li>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Metamorph dashboard</title>
<meta name="referrer" content="no-referrer">
<style>${CSS}</style></head>
<body>
<aside>
<div class="brand"><svg class="logo" viewBox="0 0 64 64" shape-rendering="crispEdges" fill="currentColor" role="img" aria-label="Metamorph logo"><path d="${LOGO_D64}"/></svg><div><h1>Metamorph</h1><p class="sub">Browser dashboard</p></div></div>
<form id="form" autocomplete="off">
<div><label for="repo">Repository URL</label><input id="repo" type="url" placeholder="https://github.com/owner/repo" spellcheck="false"></div>
<div class="f"><label for="sub">Subfolder (optional)</label><input id="sub" type="text" placeholder="apps/api" spellcheck="false"></div>
<div class="f"><label for="goal">Goal</label><select id="goal"><option value="modernize_all">modernize_all</option><option value="patch_advisory">patch_advisory</option><option value="upgrade_runtime">upgrade_runtime</option></select></div>
<div class="f"><label for="key">API key</label><input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Bearer key"><p class="note">Your key stays in this tab and is sent only to this server.</p>
<div class="bar"><span id="hint" class="note"></span><button type="button" id="forget" class="link">Forget key</button></div></div>
<div class="f"><button type="submit" id="run" class="primary" disabled>Run assess</button></div>
</form>
<ol aria-label="Flow">
${step('assess', 1, 'Assess')}${step('plan', 2, 'Plan')}${step('preview', 3, 'Preview')}${step('report', 4, 'Report')}${step('apply', 5, 'Apply', 'write scope')}<li id="s-verify"><button type="button" disabled><span class="n">6</span>Verify<span class="h">write scope</span></button></li>
</ol>
<div class="bar foot"><button type="button" id="theme">Toggle theme</button><a href="/">Back to overview</a></div>
</aside>
<main id="main"><div id="empty">Enter a repository and key, then run Assess.<br>The real dashboard widget appears here.</div><div id="busy">Working...</div></main>
<div id="status" role="status" aria-live="polite">Ready.</div>
<script>${JS}</script></body></html>`;
}

interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): unknown;
  send(body: string): unknown;
}
export function handleApp(_req: unknown, res: Res): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', appCsp());
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderApp());
}

export interface AppHostApp {
  get(path: string, handler: (req: never, res: never) => void): unknown;
}
export function installAppHost(app: AppHostApp): void {
  app.get('/app', ((req: unknown, res: Res) => handleApp(req, res)) as (req: never, res: never) => void);
}
