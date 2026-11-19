import "server-only";

import { like } from "drizzle-orm";
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
  /** v2.9.8.0 — video-render options for native <video> elements (an img
   *  that was replaced by a video never touches this pre-paint script —
   *  that conversion happens post-hydration to stay hydration-safe). */
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoControls?: boolean;
};

export type BootPatchMap = Record<
  string,
  Array<{ s: string; d: BootPatchData }>
>;

let cache: { at: number; map: BootPatchMap } | null = null;

/* v2.9.1.0 — one-time sweep of LEGACY footer patches. Footer edits used to
   stack visual patches on top of the hardcoded footer; the footer is now
   settings-backed (Admin → Footer + the visual editor write-through), so
   any stale patch would fight the managed values on every page — exactly
   the corruption the anti-corrupt policy removes. Runs once per process,
   before the first layout render reads the map. */
let footerSweep: Promise<void> | null = null;
function sweepLegacyFooterPatches() {
  if (!footerSweep) {
    footerSweep = db
      .delete(visualPatches)
      .where(like(visualPatches.selector, `%data-visual-key="footer%`))
      .then(() => undefined)
      .catch(() => undefined);
  }
  return footerSweep;
}

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
    await sweepLegacyFooterPatches();
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
/* v2.8.93.0 — global "*" rows (the site crest emblem) apply on EVERY page
   (worklog Task 97, A4): per-page rows concat after the wildcard so a
   page row still wins when both exist. */
function list(){return (MAP["*"]||[]).concat(MAP[window.location.pathname]||[])}
/* Style patches are applied through an injected stylesheet, NOT inline
   DOM mutation — mutating attributes before React hydrates causes
   hydration-mismatch errors (e.g. when hiding an element). CSS never
   touches the DOM, so React and the stylesheet never fight. */
var cssRules=[];
function cssSafe(v){return String(v).replace(/[{};]*\\/\\*/g,"")}
/* v2.9.8.0 — video URL sniff (mirrors src/lib/media-kind.ts): the proxied
   /api/media/file?key=videos%2F…mp4 shape ends with the extension, direct
   bucket URLs carry it in the path. */
function isVid(u){return /\\.(mp4|m4v|webm|ogg|ogv|mov|mkv)(\\?|$)/i.test(u||"")}
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
if(typeof d.backgroundImage==="string"&&!isVid(d.backgroundImage)){
cssRules.push(p.s+"{background-image:"+(d.backgroundImage?'url("'+cssSafe(d.backgroundImage).replace(/"/g,"%22")+'")':"none")+" !important;background-size:cover !important;background-position:center !important}");
if(el&&el.hasAttribute("data-visual-bg"))cssRules.push(p.s+" > *:not([data-visual-video-bg]){opacity:"+(d.backgroundImage?"0":"")+"}");}
/* v2.9.8.0 — a VIDEO background never goes through CSS url(): the
   post-hydration pass injects a real <video> child; pre-paint we only
   hide the placeholder children so nothing flashes underneath it. */
if(typeof d.backgroundImage==="string"&&isVid(d.backgroundImage)&&el&&el.hasAttribute("data-visual-bg")){
cssRules.push(p.s+" > *:not([data-visual-video-bg]){opacity:0}")}
if(typeof d.backgroundColor==="string")cssRules.push(p.s+"{background-color:"+cssSafe(d.backgroundColor)+" !important}");
if(!el)return;
if(typeof d.text==="string"&&el.tagName!=="IMG")setText(el,d.text,d.textMode||"full");
if(el.tagName==="A"&&typeof d.href==="string")el.setAttribute("href",d.href);
if(el.tagName==="IMG"){
/* v2.9.8.0 — an img whose patch src is a VIDEO is left untouched here:
   converting the node pre-hydration would trip React 19's hydration
   mismatch (the exact class of bug the butter-smooth round removed).
   SiteImage renders these server-side via the patch context, and the
   post-hydration pass converts any remaining raw <img> nodes. */
if(typeof d.src==="string"&&d.src&&!isVid(d.src)&&el.getAttribute("src")!==d.src){
el.removeAttribute("srcset");el.removeAttribute("sizes");el.setAttribute("src",d.src)}
if(typeof d.alt==="string"&&!isVid(d.src))el.setAttribute("alt",d.alt)}
if((el.tagName==="VIDEO"||el.tagName==="IFRAME")&&typeof d.src==="string"&&d.src)el.setAttribute("src",d.src);
/* v2.9.8.0 — video render options on EXISTING native <video> elements.
   Absent flags never touch the attributes (pages with pre-existing
   videos must keep their current behaviour). */
if(el.tagName==="VIDEO"){
if(typeof d.videoControls==="boolean"){if(d.videoControls)el.setAttribute("controls","");else el.removeAttribute("controls")}
if(typeof d.videoAutoplay==="boolean"){if(d.videoAutoplay)el.setAttribute("autoplay","");else el.removeAttribute("autoplay")}
if(typeof d.videoLoop==="boolean"){if(d.videoLoop)el.setAttribute("loop","");else el.removeAttribute("loop")}
if(typeof d.videoMuted==="boolean"){if(d.videoMuted)el.setAttribute("muted","");else el.removeAttribute("muted");try{el.muted=!!d.videoMuted}catch(e){}}}
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
