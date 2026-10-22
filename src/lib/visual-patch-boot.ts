import "server-only";

import { db } from "@/db";
import { visualPatches } from "@/db/schema";

export type BootPatchData = {
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  hidden?: boolean;
  textMode?: "direct" | "full";
  backgroundImage?: string;
  backgroundColor?: string;
};

export type BootPatchMap = Record<
  string,
  Array<{ s: string; d: BootPatchData }>
>;

let cache: { at: number; map: BootPatchMap } | null = null;

/**
 * Every published element patch, grouped by page path, in a compact form
 * suitable for inlining into the document head. Embedded bootstrap applies
 * these before first paint so visitors never see a flash of the original
 * content after an image or text has been changed in the visual editor.
 */
export async function getPublishedVisualPatchMap(): Promise<BootPatchMap> {
  // Tiny in-process cache — publishing busts it within seconds.
  if (cache && Date.now() - cache.at < 5000) return cache.map;

  try {
    const rows = await db
      .select({
        pagePath: visualPatches.pagePath,
        selector: visualPatches.selector,
        publishedData: visualPatches.publishedData,
      })
      .from(visualPatches);

    const map: BootPatchMap = {};
    for (const row of rows) {
      const data = (row.publishedData ?? {}) as BootPatchData;
      if (!data || typeof data !== "object" || Object.keys(data).length === 0) continue;
      (map[row.pagePath] ||= []).push({ s: row.selector, d: data });
    }
    cache = { at: Date.now(), map };
    return map;
  } catch {
    // The public site must still render if the database is momentarily down.
    return cache?.map ?? {};
  }
}

/** Inline bootstrap executed during initial HTML parse, before first paint. */
export const VISUAL_PATCH_BOOTSTRAP = `(function(){
function inEditor(){return /[?&]visualEditor=1/.test(window.location.search)}
if(inEditor())return;/* editor renders DRAFT patches — do not fight it */
if(window.__stcVpBooted)return;window.__stcVpBooted=true;
var MAP=window.__STC_VP__||{};
function list(){return MAP[window.location.pathname]||[]}
/* Style patches are applied through an injected stylesheet, NOT inline
   DOM mutation — mutating attributes before React hydrates causes
   hydration-mismatch errors (e.g. when hiding an element). CSS never
   touches the DOM, so React and the stylesheet never fight. */
var cssRules=[];
function cssSafe(v){return String(v).replace(/[{};]*\\/\\*/g,"")}
function setText(el,value,mode){
if(mode==="full"){if(el.textContent!==value)el.textContent=value;return}
var nodes=[],i;
for(i=0;i<el.childNodes.length;i++){if(el.childNodes[i].nodeType===3)nodes.push(el.childNodes[i])}
if(!nodes.length){el.insertBefore(document.createTextNode(value),el.firstChild);return}
var current=nodes.map(function(n){return n.textContent||""}).join(" ").replace(/\\s+/g," ").trim();
if(current===value)return;
nodes[0].textContent=value;
for(i=1;i<nodes.length;i++)nodes[i].textContent="";}
function applyOne(p){
var el;try{el=document.querySelector(p.s)}catch(e){return}
var d=p.d||{};
if(typeof d.hidden==="boolean")cssRules.push(p.s+"{display:"+(d.hidden?"none !important":"revert !important")+"}");
if(typeof d.backgroundImage==="string"){
cssRules.push(p.s+"{background-image:"+(d.backgroundImage?'url("'+cssSafe(d.backgroundImage).replace(/"/g,"%22")+'")':"none")+" !important;background-size:cover !important;background-position:center !important}");
if(el&&el.hasAttribute("data-visual-bg"))cssRules.push(p.s+" > *{opacity:"+(d.backgroundImage?"0":"")+"}");}
if(typeof d.backgroundColor==="string")cssRules.push(p.s+"{background-color:"+cssSafe(d.backgroundColor)+" !important}");
if(!el)return;
if(typeof d.text==="string"&&el.tagName!=="IMG")setText(el,d.text,d.textMode||"full");
if(el.tagName==="A"&&typeof d.href==="string")el.setAttribute("href",d.href);
if(el.tagName==="IMG"){
if(typeof d.src==="string"&&d.src&&el.getAttribute("src")!==d.src){
el.removeAttribute("srcset");el.removeAttribute("sizes");el.setAttribute("src",d.src)}
if(typeof d.alt==="string")el.setAttribute("alt",d.alt)}
if((el.tagName==="VIDEO"||el.tagName==="IFRAME")&&typeof d.src==="string"&&d.src)el.setAttribute("src",d.src);
var trend=el.closest&&el.closest("[data-trend-row]");
if(trend&&typeof d.text==="string"){
var n=parseFloat(d.text.replace(/[^0-9.]/g,""));var bar=trend.querySelector("[data-trend-bar]");
if(bar&&!isNaN(n))bar.style.width=Math.max(0,Math.min(100,n))+"%";}}
function applyAll(){var l=list(),i;for(i=0;i<l.length;i++)applyOne(l[i]);
if(cssRules.length){var st=document.getElementById("stc-vp-boot-css")||document.createElement("style");
st.id="stc-vp-boot-css";st.textContent=cssRules.join("\\n");
(document.head||document.documentElement).appendChild(st)}}
var pending=false;
function schedule(){if(inEditor()||pending)return;pending=true;
var run=function(){pending=false;applyAll()};
if(window.requestAnimationFrame)window.requestAnimationFrame(run);else setTimeout(run,0)}
applyAll();
if(document.documentElement)new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("DOMContentLoaded",applyAll);
})();`;
