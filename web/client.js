var API = window.POKEMON_API || location.origin;
var SPRITE_BASE = "https://play.pokemonshowdown.com/sprites";
var ICON_SHEET = SPRITE_BASE + "/pokemonicons-sheet.png";
var TYPE_COLORS = {
  Normal:"#A8A878",Fire:"#F08030",Water:"#6890F0",Grass:"#78C850",Electric:"#F8D030",
  Ice:"#98D8D8",Fighting:"#C03028",Poison:"#A040A0",Ground:"#E0C068",Flying:"#A890F0",
  Psychic:"#F85888",Bug:"#A8B820",Rock:"#B8A038",Ghost:"#705898",Dragon:"#7038F8",
  Dark:"#705848",Steel:"#B8B8D0",Fairy:"#EE99AC"
};
var ICON_NUMS = {
  bulbasaur:1,ivysaur:2,venusaur:3,charmander:4,charmeleon:5,charizard:6,squirtle:7,wartortle:8,blastoise:9,
  caterpie:10,metapod:11,butterfree:12,weedle:13,kakuna:14,beedrill:15,pidgey:16,pidgeotto:17,pidgeot:18,
  rattata:19,raticate:20,spearow:21,fearow:22,ekans:23,arbok:24,pikachu:25,raichu:26,sandshrew:27,sandslash:28,
  nidoranf:29,nidorina:30,nidoqueen:31,nidoranm:32,nidorino:33,nidoking:34,clefairy:35,clefable:36,
  vulpix:37,ninetales:38,jigglypuff:39,wigglytuff:40,zubat:41,golbat:42,oddish:43,gloom:44,vileplume:45,
  paras:46,parasect:47,venonat:48,venomoth:49,diglett:50,dugtrio:51,meowth:52,persian:53,psyduck:54,golduck:55,
  mankey:56,primeape:57,growlithe:58,arcanine:59,poliwag:60,poliwhirl:61,poliwrath:62,abra:63,kadabra:64,
  alakazam:65,machop:66,machoke:67,machamp:68,bellsprout:69,weepinbell:70,victreebel:71,tentacool:72,
  tentacruel:73,geodude:74,graveler:75,golem:76,ponyta:77,rapidash:78,slowpoke:79,slowbro:80,magnemite:81,
  magneton:82,farfetchd:83,doduo:84,dodrio:85,seel:86,dewgong:87,grimer:88,muk:89,shellder:90,cloyster:91,
  gastly:92,haunter:93,gengar:94,onix:95,drowzee:96,hypno:97,krabby:98,kingler:99,voltorb:100,electrode:101,
  exeggcute:102,exeggutor:103,cubone:104,marowak:105,hitmonlee:106,hitmonchan:107,lickitung:108,koffing:109,
  weezing:110,rhyhorn:111,rhydon:112,chansey:113,tangela:114,kangaskhan:115,horsea:116,seadra:117,goldeen:118,
  seaking:119,staryu:120,starmie:121,mrmime:122,scyther:123,jynx:124,electabuzz:125,magmar:126,pinsir:127,
  tauros:128,magikarp:129,gyarados:130,lapras:131,ditto:132,eevee:133,vaporeon:134,jolteon:135,flareon:136,
  porygon:137,omanyte:138,omastar:139,kabuto:140,kabutops:141,aerodactyl:142,snorlax:143,articuno:144,
  zapdos:145,moltres:146,dratini:147,dragonair:148,dragonite:149,mewtwo:150,mew:151
};
var sessionId = null, battleState = null, manifest = null, lastLogHash = "";

function $(id) { return document.getElementById(id); }
function toId(n) { return (n||"").toLowerCase().replace(/[^a-z0-9]/g,""); }
function spriteUrl(n,back) { return SPRITE_BASE+(back?"/ani-back/":"/ani/")+toId(n)+".gif"; }
function spriteStatic(n,back) { return SPRITE_BASE+(back?"/gen5-back/":"/gen5/")+toId(n)+".png"; }
function iconStyle(n) {
  var num = ICON_NUMS[toId(n)]||0, top = Math.floor(num/12)*30, left = (num%12)*40;
  return "background:url("+ICON_SHEET+") no-repeat -"+left+"px -"+top+"px;width:40px;height:30px;image-rendering:pixelated;display:inline-block;";
}
function setHp(el, pct) {
  el.style.width = pct+"%";
  el.className = "hp-fill"+(pct<25?" red":pct<50?" yellow":"");
}
function addLog(text, cls) {
  var el = document.createElement("div");
  el.className = "log-line "+(cls||"info");
  el.textContent = text;
  $("battle-log").appendChild(el);
  $("battle-log").scrollTop = $("battle-log").scrollHeight;
}

async function apiPost(ep, body) {
  var r = await fetch(API+ep, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})});
  return r.json();
}

function setStatus(online, text) {
  var b = $("status-badge");
  b.className = "badge "+(online?"online":"offline");
  b.textContent = online?"LIVE":"OFFLINE";
  $("battle-id").textContent = text||"";
}

async function joinBattle() {
  setStatus(false,"joining...");
  try {
    var d = await apiPost("/play/join",{alias:"Player"});
    if(!d.ok){setStatus(false,d.error);return;}
    sessionId=d.sessionId; manifest=d.manifest; battleState=d.state; lastLogHash="";
    $("battle-log").innerHTML=""; $("battle-overlay").classList.add("hidden");
    setStatus(true,"Battle "+d.battleId.slice(0,8));
    renderManifest(); renderBattle(); addLog("Battle started!","system");
  } catch(e) { setStatus(false,e.message); }
}

async function sendAction(action, slot) {
  if(!sessionId) return;
  disableActions();
  try {
    var d = await apiPost("/play/action",{sessionId:sessionId,action:action,slot:parseInt(slot)});
    if(d.state){battleState=d.state;renderBattle();}
    if(!d.ok){addLog("Error: "+d.error,"info");enableActions();}
  } catch(e){addLog("Error: "+e.message,"info");enableActions();}
}

async function newBattle() {
  try {
    var d = await apiPost("/play/new",{sessionId:sessionId});
    if(!d.ok) return;
    sessionId=d.sessionId; battleState=d.state; manifest=d.manifest; lastLogHash="";
    $("battle-log").innerHTML=""; $("battle-overlay").classList.add("hidden");
    renderBattle(); addLog("New battle started!","system");
    setStatus(true,"Battle "+d.battleId.slice(0,8));
  } catch(e){addLog("Error: "+e.message,"info");}
}

function renderManifest() {
  if(!manifest) return;
  var h='<p style="margin-bottom:6px">'+manifest.description+'</p>';
  h+='<div class="rule-header">OBJECTIVE</div><div class="rule">'+manifest.objective+'</div>';
  if(manifest.rules){h+='<div class="rule-header">RULES</div>';manifest.rules.forEach(function(r){h+='<div class="rule">'+r+'</div>';});}
  $("manifest-content").innerHTML=h;
}

function renderBattle() {
  if(!battleState) return;
  $("turn-num").textContent=battleState.turn;
  var a=battleState.active;
  if(a){
    $("player-name").textContent=a.name;
    var pp=a.maxHp>0?(a.hp/a.maxHp)*100:0;
    setHp($("player-hp"),pp);
    $("player-hp-text").textContent=a.hp+" / "+a.maxHp;
    var pi=$("player-sprite"); pi.src=spriteUrl(a.name,true); pi.alt=a.name; pi.style.display="";
    pi.onerror=function(){this.src=spriteStatic(a.name,true);};
  } else {
    $("player-name").textContent="???"; setHp($("player-hp"),0); $("player-hp-text").textContent=""; $("player-sprite").style.display="none";
  }
  renderOpponent(); renderTeam(); renderMoves(); renderSwitchButtons(); renderLog();

  if(battleState.battleOver){
    var isW=battleState.winner!=="Wild AI"&&battleState.winner!=="tie";
    var msg=isW?"YOU WIN!":battleState.winner==="tie"?"TIE!":"YOU LOSE!";
    $("overlay-text").textContent=msg; $("battle-overlay").classList.remove("hidden");
    addLog(msg,"win"); $("action-prompt").textContent=msg;
    disableActions();
  } else if(battleState.waitingForAction){
    $("action-prompt").textContent=battleState.mustSwitch?"Your Pokemon fainted! Switch in another.":"Choose a move or switch Pokemon.";
  } else {
    $("action-prompt").textContent="Waiting...";
  }
}

function renderOpponent() {
  var log=battleState.log||[], oppName="???", oppPct=100, oppHp="";
  for(var i=log.length-1;i>=0;i--){
    var l=log[i];
    var dm=l.match(/^(.+?) took damage .+ (\d+)\/(\d+)/);
    if(dm&&battleState.active&&dm[1]!==battleState.active.name){oppName=dm[1];oppPct=(parseInt(dm[2])/parseInt(dm[3]))*100;oppHp=dm[2]+"/"+dm[3];break;}
    if(l.includes("took damage")&&l.includes("0 fnt")){var m2=l.match(/^(.+?) took damage/);if(m2&&battleState.active&&m2[1]!==battleState.active.name){oppName=m2[1];oppPct=0;oppHp="FNT";break;}}
    var sw=l.match(/sent out (.+?)!/);if(sw){var sn=sw[1];if(!battleState.active||sn!==battleState.active.name){oppName=sn;break;}}
  }
  $("opp-name").textContent=oppName;
  setHp($("opp-hp"),oppPct);
  $("opp-hp-text").textContent=oppHp;
  if(oppName!=="???"){var oi=$("opp-sprite");oi.src=spriteUrl(oppName,false);oi.alt=oppName;oi.style.display="";oi.onerror=function(){this.src=spriteStatic(oppName,false);};}
  else{$("opp-sprite").style.display="none";}
}

function renderTeam() {
  var team=battleState.team||[]; $("team-list").innerHTML="";
  team.forEach(function(p){
    var cls=p.fainted?"fainted":p.active?"active":"";
    var d=document.createElement("div"); d.className="team-mon "+cls;
    d.innerHTML='<span class="team-icon" style="'+iconStyle(p.name)+'"></span><span class="team-name">'+p.name+'</span><span class="team-hp">'+(p.fainted?"FNT":p.hp+"/"+p.maxHp)+'</span>';
    $("team-list").appendChild(d);
  });
}

function renderMoves() {
  var moves=(battleState.active&&battleState.active.moves)||[];
  var waiting=battleState.waitingForAction&&!battleState.battleOver;
  var mustSwitch=battleState.mustSwitch;
  document.querySelectorAll(".move-btn").forEach(function(btn,i){
    if(i<moves.length){
      var m=moves[i], mId=toId(m.name);
      btn.innerHTML=m.name+'<span class="move-pp">PP '+m.pp+"/"+m.maxPp+'</span>';
      btn.style.background=TYPE_COLORS[getMoveType(mId)]||"#888";
      btn.disabled=!waiting||mustSwitch||m.disabled||m.pp<=0;
    } else { btn.innerHTML="&mdash;"; btn.style.background="#555"; btn.disabled=true; }
  });
}

function getMoveType(moveId) {
  var types={thunderbolt:"Electric",thunder:"Electric",thundershock:"Electric",thunderwave:"Electric",
    psychic:"Psychic",confusion:"Psychic",psybeam:"Psychic",hypnosis:"Psychic",dreameater:"Psychic",
    flamethrower:"Fire",fireblast:"Fire",firepunch:"Fire",firespin:"Fire",ember:"Fire",
    icebeam:"Ice",blizzard:"Ice",icepunch:"Ice",aurorabeam:"Ice",
    surf:"Water",hydropump:"Water",watergun:"Water",bubblebeam:"Water",bubble:"Water",
    earthquake:"Ground",dig:"Ground",fissure:"Ground",
    razorleaf:"Grass",solarbeam:"Grass",megadrain:"Grass",vinewhip:"Grass",sleeppowder:"Grass",stunspore:"Grass",
    bodyslam:"Normal",hyperbeam:"Normal",slash:"Normal",strength:"Normal",tackle:"Normal",quickattack:"Normal",
    explosion:"Normal",selfdestruct:"Normal",doubleedge:"Normal",triattack:"Normal",headbutt:"Normal",
    submission:"Fighting",highjumpkick:"Fighting",karatechop:"Fighting",lowkick:"Fighting",seismictoss:"Fighting",
    rockslide:"Rock",rockthrow:"Rock",
    shadowball:"Ghost",nightshade:"Ghost",lick:"Ghost",confuseray:"Ghost",
    sludgebomb:"Poison",toxic:"Poison",poisonpowder:"Poison",acid:"Poison",sludge:"Poison",
    fly:"Flying",drillpeck:"Flying",wingattack:"Flying",skyattack:"Flying",
    pinmissile:"Bug",twineedle:"Bug",leechlife:"Bug",
    dragonclaw:"Dragon",dragonrage:"Dragon",outrage:"Dragon"};
  return types[moveId]||"Normal";
}

function renderSwitchButtons() {
  var team=battleState.team||[], waiting=battleState.waitingForAction&&!battleState.battleOver;
  $("switch-row").innerHTML="";
  team.forEach(function(p){
    if(p.active||p.fainted) return;
    var btn=document.createElement("button"); btn.className="switch-btn";
    btn.innerHTML='<span class="sw-icon" style="'+iconStyle(p.name)+'"></span>'+p.name+' ('+p.hp+'/'+p.maxHp+')';
    btn.disabled=!waiting;
    btn.addEventListener("click",function(){sendAction("switch",p.slot);});
    $("switch-row").appendChild(btn);
  });
}

function renderLog() {
  var log=battleState.log||[], hash=log.join("|");
  if(hash===lastLogHash) return;
  $("battle-log").innerHTML=""; addLog("Battle started!","system");
  log.forEach(function(l){ addLog(l, classifyLog(l)); });
  lastLogHash=hash;
}

function classifyLog(l) {
  if(l.includes("fainted")) return "faint";
  if(l.includes("super effective")) return "super";
  if(l.includes("critical hit")) return "critical";
  if(l.includes("not very effective")) return "resist";
  if(l.includes("took damage")) return "damage";
  if(l.includes("healed")) return "heal";
  if(l.includes("Winner")) return "win";
  return "info";
}

function disableActions() {
  document.querySelectorAll(".move-btn").forEach(function(b){b.disabled=true;});
  document.querySelectorAll(".switch-btn").forEach(function(b){b.disabled=true;});
}
function enableActions() {
  if(!battleState||!battleState.waitingForAction||battleState.battleOver) return;
  renderMoves(); renderSwitchButtons();
}

document.querySelectorAll(".move-btn").forEach(function(btn){
  btn.addEventListener("click",function(){if(!btn.disabled) sendAction("move",btn.dataset.slot);});
});
$("new-battle-btn").addEventListener("click",newBattle);
document.addEventListener("keydown",function(e){
  if(!battleState||battleState.battleOver||!battleState.waitingForAction) return;
  if(e.key>="1"&&e.key<="4"){e.preventDefault();var b=document.querySelector('.move-btn[data-slot="'+e.key+'"]');if(b&&!b.disabled) sendAction("move",e.key);}
});

joinBattle();
