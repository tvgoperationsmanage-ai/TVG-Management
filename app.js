import {initializeApp} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,sendPasswordResetEmail,updatePassword,reauthenticateWithCredential,EmailAuthProvider} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,addDoc,setDoc,updateDoc,deleteDoc,query,where,limit,serverTimestamp,onSnapshot} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

/* =========================================================
   TVG MANAGEMENT - Firebase configuration
   IMPORTANT:
   Paste the EXACT Web App config from:
   Firebase Console > Project settings > Your apps > Web app
   Do not put a Firebase Admin/service-account key here.
   ========================================================= */
const firebaseConfig={
  apiKey:"AIzaSyCo_l9qLmhVxvZIvt36Uj33VJycewcGCVo",
  authDomain:"tvg-managment.firebaseapp.com",
  projectId:"tvg-managment",
  storageBucket:"tvg-managment.firebasestorage.app",
  messagingSenderId:"789278628561",
  appId:"1:789278628561:web:ef156b3de889ffdee483f0"
};

const configured=!Object.values(firebaseConfig).some(v=>String(v).includes("PASTE_"));
let app=null,auth=null,db=null,currentUser=null,currentProfile=null;

if(configured){
  app=initializeApp(firebaseConfig);
  auth=getAuth(app);
  db=getFirestore(app);
}

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi"}).format(new Date());
const timeNow=()=>new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Karachi",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
const currentRole=()=>String(currentProfile?.role||"employee").toLowerCase();
let appSettings={timeFormat:"24",name:"TVG"};
// V3 workflow layer: deliberately isolated from the working V1 core.
let notificationUnsub=null,notificationCache=[],notificationStarted=false;

const formatTime=value=>{if(!value)return "—"; if(String(appSettings.timeFormat||"24")==="24")return String(value); const m=String(value).match(/^(\d{1,2}):(\d{2})$/); if(!m)return String(value); let h=Number(m[1]),min=m[2],ap=h>=12?"PM":"AM"; h=h%12||12; return `${h}:${min} ${ap}`};
const phoneHref=value=>{const p=String(value||"").replace(/[^+\d]/g,"");return p?`tel:${p}`:"#"};
async function loadAppSettings(){try{const s=await getDoc(doc(db,"settings","general"));appSettings=s.exists()?{...appSettings,...s.data(),radiusMeters:Number(s.data().radiusMeters||150)}:appSettings}catch(e){console.warn("Settings load failed",e)}}
const roleMgmt=()=>["admin","manager","hr"].includes(currentRole());
const isAdmin=()=>currentRole()==="admin";
const toast=(msg)=>{const r=$("#toastRoot");r.innerHTML=`<div class="toast">${esc(msg)}</div>`;setTimeout(()=>r.innerHTML="",2800)};
const friendlyAuth=e=>{
  const c=e?.code||"";
  if(c.includes("invalid-credential")||c.includes("wrong-password")||c.includes("user-not-found"))return"Email or password is incorrect.";
  if(c.includes("too-many-requests"))return"Too many attempts. Please wait a little and try again.";
  if(c.includes("network-request-failed"))return"Network connection failed. Check internet and try again.";
  if(c.includes("operation-not-allowed"))return"Email/password login is not enabled in Firebase Authentication.";
  if(c.includes("invalid-email"))return"Please enter a valid email address.";
  return e?.message||"Sign-in failed.";
};
const roleLabel=r=>({admin:"Administrator",manager:"Operations Manager",hr:"HR",employee:"Employee"}[r]||r);
const moduleDefs={
  manpower:{title:"Manpower Management",desc:"Department-wise workforce planning and approved positions.",fields:[
    ["department","Department","text",true],["designation","Designation","text",true],["budgeted","Budgeted Positions","number",true],["filled","Filled Positions","number",true],["notes","Notes","textarea",false]]},
  recruitment:{title:"Recruitment Management",desc:"Vacancies, candidates and hiring pipeline.",fields:[
    ["position","Position","text",true],["department","Department","text",true],["candidate","Candidate","text",false],["stage","Stage","select",true,["Open","Screening","Interview","Selected","Rejected","Joined"]],["owner","Recruiter / Owner","text",false],["notes","Notes","textarea",false]]},
  onboarding:{title:"Onboarding Management",desc:"New-joiner onboarding checklist and status.",fields:[
    ["employeeName","Employee","text",true],["joiningDate","Joining Date","date",true],["department","Department","text",true],["status","Status","select",true,["Pending","In Progress","Completed"]],["checklist","Checklist / Notes","textarea",false]]},
  performance:{title:"Performance Management",desc:"Appraisal cycles, goals and review records.",fields:[
    ["employeeName","Employee","text",true],["period","Review Period","text",true],["reviewer","Reviewer","text",true],["score","Score / Rating","text",false],["status","Status","select",true,["Draft","In Review","Completed"]],["comments","Comments","textarea",false]]},
  training:{title:"Training Management",desc:"Training plan, attendance and completion tracking.",fields:[
    ["title","Training Title","text",true],["employeeName","Employee","text",false],["trainer","Trainer","text",false],["date","Date","date",true],["status","Status","select",true,["Planned","Scheduled","Completed","Cancelled"]],["notes","Notes","textarea",false]]},
  shifts:{title:"Shifts & Schedules",desc:"Shift roster and working schedule register.",fields:[
    ["shift","Shift Name","text",true],["employeeName","Employee","text",true],["date","Date","date",true],["start","Start","time",true],["end","End","time",true],["status","Status","select",true,["Scheduled","Off","Leave","Completed"]]]},
  assets:{title:"Assets Management",desc:"Company assets issued to employees and returned.",fields:[
    ["assetTag","Asset Tag","text",true],["assetType","Asset Type","text",true],["employeeName","Assigned To","text",false],["issueDate","Issue Date","date",true],["returnDate","Return Date","date",false],["status","Status","select",true,["Issued","Returned","Repair","Lost"]],["notes","Notes","textarea",false]]},
  expenses:{title:"Expense Management",desc:"Employee/business expense claims and approvals.",fields:[
    ["employeeName","Employee","text",true],["date","Expense Date","date",true],["category","Category","text",true],["amount","Amount","number",true],["status","Status","select",true,["Pending","Approved","Rejected","Paid"]],["notes","Details","textarea",false]]},
  travel:{title:"Travel Management",desc:"Travel requests, approvals and settlement tracking.",fields:[
    ["employeeName","Employee","text",true],["destination","Destination","text",true],["from","From Date","date",true],["to","To Date","date",true],["purpose","Purpose","textarea",true],["status","Status","select",true,["Requested","Approved","Rejected","Completed"]]]},
  payroll:{title:"Payroll Register",desc:"Controlled monthly payroll register. Configure TVG salary policy before production payroll use.",fields:[
    ["employeeName","Employee","text",true],["period","Payroll Month","month",true],["basic","Basic Salary","number",true],["allowances","Allowances","number",false],["deductions","Deductions","number",false],["net","Net Pay","number",false],["status","Status","select",true,["Draft","Approved","Paid"]],["notes","Notes","textarea",false]]},
  letters:{title:"HR Letters",desc:"HR letter requests and issue register.",fields:[
    ["employeeName","Employee","text",true],["letterType","Letter Type","select",true,["Employment","Experience","Salary","Warning","Confirmation","Other"]],["requestDate","Request Date","date",true],["issuedDate","Issued Date","date",false],["status","Status","select",true,["Requested","Prepared","Issued","Rejected"]],["notes","Notes","textarea",false]]},
  separation:{title:"Separation Management",desc:"Resignation, termination and exit records.",fields:[
    ["employeeName","Employee","text",true],["type","Separation Type","select",true,["Resignation","Termination","Contract End","Other"]],["noticeDate","Notice Date","date",true],["lastDate","Last Working Date","date",false],["status","Status","select",true,["Initiated","In Process","Cleared","Closed"]],["reason","Reason / Notes","textarea",false]]},
  employeeFinance:{title:"Employee Advances & Loans",desc:"Track employee advances, loans, recoveries and outstanding balances.",fields:[
    ["employeeId","Employee","text",true], ["type","Record Type","select",true,["Advance","Loan"]], ["date","Issue Date","date",true], ["amount","Original Amount","number",true], ["paidAmount","Recovered / Paid","number",false], ["status","Status","select",true,["Open","Partially Paid","Settled","Cancelled"]], ["notes","Notes","textarea",false]]},
  alerts:{title:"Scheduled Alerts",desc:"Operational reminder register for HR and management follow-up.",fields:[
    ["title","Alert Title","text",true],["audience","Audience","text",true],["date","Due Date","date",true],["priority","Priority","select",true,["Low","Normal","High"]],["status","Status","select",true,["Open","Done","Cancelled"]],["notes","Notes","textarea",false]]}
};

async function init(){
  setTimeout(()=>$("#splash").classList.add("hidden"),700);
  if(!configured){
    $("#login").classList.remove("hidden");
    $("#loginError").textContent="Firebase config is not filled. Open app.js and paste the Web App config from Firebase Console.";
    $("#loginBtn").disabled=true;
    $("#loginBtn").title="Configure Firebase first";
    return;
  }
  onAuthStateChanged(auth,async u=>{
    currentUser=u;
    if(!u){showLogin();return}
    try{
      const p=await getDoc(doc(db,"users",u.uid));
      if(!p.exists()){
        await signOut(auth);
        showLogin("Your Firebase account exists, but the TVG users profile for this UID has not been created.");
        return;
      }
      currentProfile={uid:u.uid,...p.data()};
      await loadAppSettings();
      if(String(currentProfile.status||"Active").toLowerCase()==="inactive"){
        await signOut(auth);showLogin("This TVG employee profile is inactive. Contact management.");return;
      }
      showApp();bindNav();await render("dashboard");startLiveClock();
    }catch(e){
      try{await signOut(auth)}catch(_e){}
      console.error("TVG profile load failed", {
        code:e?.code||"unknown",
        message:e?.message||String(e),
        authUid:u?.uid||"",
        authEmail:u?.email||""
      });
      const code=e?.code||"";
      if(code.includes("permission-denied")){
        showLogin("Login succeeded, but Firestore denied the TVG profile read. The admin Firebase Auth UID must exactly match the Firestore users document ID, and that document must have role=admin and status=Active.");
      }else{
        showLogin("Login succeeded, but the TVG employee profile could not be loaded. Please check the admin users document and Firebase connection.");
      }
    }
  });
}
function showLogin(msg=""){
  $("#app").classList.add("hidden");$("#login").classList.remove("hidden");
  $("#loginError").textContent=msg;
}
function showApp(){
  $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
  $("#rolePill").textContent=roleLabel(currentRole());
  $$(".management").forEach(x=>x.style.display=roleMgmt()?"flex":"none");
  mountNotificationBell();
  bindNav();
  startNotificationListener();
}
$("#loginForm").onsubmit=async e=>{
  e.preventDefault();
  if(!configured)return;
  const btn=$("#loginBtn");btn.disabled=true;btn.textContent="Signing in…";$("#loginError").textContent="";
  try{await signInWithEmailAndPassword(auth,$("#email").value.trim(),$("#password").value)}
  catch(err){$("#loginError").textContent=friendlyAuth(err)}
  finally{btn.disabled=false;btn.textContent="Sign in"}
};
$("#forgotBtn").onclick=async()=>{
  const email=$("#email").value.trim();
  if(!email){$("#loginError").textContent="Enter your email first.";return}
  try{await sendPasswordResetEmail(auth,email);toast("Password reset email sent.");}
  catch(e){$("#loginError").textContent=friendlyAuth(e)}
};
$("#logout").onclick=async()=>{stopNotificationListener();await signOut(auth)};
let clockTimer=null;
function startLiveClock(){clearInterval(clockTimer);const tick=()=>{const el=$("#liveClock");if(!el)return;const now=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Karachi",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:String(appSettings.timeFormat||"24")==="12"}).format(new Date());el.textContent=now};tick();clockTimer=setInterval(tick,1000)}
function bindNav(){$$(".nav").forEach(n=>n.onclick=()=>{render(n.dataset.view);$("#side")?.classList.remove("open")});const mt=$("#menuToggle");if(mt&&!mt.dataset.bound){mt.dataset.bound="1";mt.onclick=e=>{e.stopPropagation();$("#side").classList.toggle("open")};document.addEventListener("click",e=>{const side=$("#side");if(side?.classList.contains("open")&&!side.contains(e.target)&&e.target!==mt)side.classList.remove("open")})}}

let deferredInstallPrompt=window.__tvgInstallPrompt || null;
let installModalOpen=false;
function isStandaloneInstalled(){
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true || document.referrer.startsWith("android-app://");
}
function installPlatform(){
  const ua=navigator.userAgent||"";
  const ios=/iPhone|iPad|iPod/i.test(ua);
  const android=/Android/i.test(ua);
  return ios?"ios":android?"android":"desktop";
}
function showInstallGuide(){
  if(installModalOpen)return;
  installModalOpen=true;
  const platform=installPlatform();
  const isIos=platform==="ios";
  const isAndroid=platform==="android";
  const title=isIos?"Install TVG on iPhone / iPad":"Install TVG Management";
  const body=isIos
    ? `<div class="install-steps"><div><b>1</b><span>Open TVG in <strong>Safari</strong>.</span></div><div><b>2</b><span>Tap the <strong>Share</strong> button.</span></div><div><b>3</b><span>Select <strong>Add to Home Screen</strong>.</span></div><div><b>4</b><span>Tap <strong>Add</strong>. TVG will appear as an app on your Home Screen.</span></div></div>`
    : isAndroid
      ? `<div class="install-steps"><div><b>1</b><span>Use <strong>Chrome</strong> and keep TVG open on its HTTPS link.</span></div><div><b>2</b><span>Tap <strong>Install TVG App</strong> below if the browser has made the PWA installable.</span></div><div><b>3</b><span>If Chrome only offers <strong>Add to Home screen</strong>, use Chrome's menu after confirming the site is updated and loaded over HTTPS.</span></div></div>`
      : `<div class="install-steps"><div><b>1</b><span>Use Chrome or Edge on HTTPS.</span></div><div><b>2</b><span>Use the browser's <strong>Install</strong> icon/menu when available.</span></div></div>`;
  const html=`<div class="install-modal-backdrop" id="installModal"><div class="install-modal" role="dialog" aria-modal="true" aria-labelledby="installTitle"><button class="install-close" id="installClose" aria-label="Close">×</button><div class="install-modal-icon"><img src="assets/tvg-icon-192.png" alt="TVG"></div><h2 id="installTitle">${title}</h2><p class="muted center">Install TVG like an app for quick access to attendance and HR operations.</p>${body}<button id="installNowBtn" class="btn primary wide install-now">Install TVG App</button><button id="installDismissBtn" class="link-btn wide" type="button">Not now</button></div></div>`;
  document.body.insertAdjacentHTML("beforeend",html);
  const modal=$("#installModal");
  const close=()=>{modal?.remove();installModalOpen=false};
  $("#installClose").onclick=close;
  $("#installDismissBtn").onclick=close;
  $("#installNowBtn").onclick=async()=>{
    if(deferredInstallPrompt){
      try{
        deferredInstallPrompt.prompt();
        const choice=await deferredInstallPrompt.userChoice;
        deferredInstallPrompt=null;
        if(choice?.outcome==="accepted") close();
        else toast("Installation was cancelled. You can try again anytime.");
      }catch(e){toast("The browser could not open the install prompt. Please use the browser install option.")}
      return;
    }
    if(isIos){
      toast("On iPhone/iPad, open TVG in Safari → Share → Add to Home Screen.");
    }else{
      toast("If the browser only shows a shortcut option, this browser/device is not exposing the native PWA installer. Use Chrome on Android or Safari on iPhone.");
    }
  };
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
}
function setupInstallPrompt(){
  const btn=$("#installAppBtn");
  if(!btn)return;
  btn.hidden=isStandaloneInstalled();
  window.addEventListener("beforeinstallprompt",e=>{
    e.preventDefault();
    deferredInstallPrompt=e;
    window.__tvgInstallPrompt=e;
    btn.hidden=false;
  });
  window.addEventListener("appinstalled",()=>{
    deferredInstallPrompt=null;
    window.__tvgInstallPrompt=null;
    btn.hidden=true;
    toast("TVG Management installed successfully.");
  });
  btn.onclick=()=>{
    if(isStandaloneInstalled())return;
    showInstallGuide();
  };
}
setupInstallPrompt();

function active(v){$$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===v))}
function layout(title,sub,body){return `<section class="hero"><div class="eyebrow">TVG Management</div><h1>${esc(title)}</h1><div class="muted">${esc(sub)}</div></section>${body}`}
function stat(a,b,c){return `<div class="card"><div class="stat-label">${esc(a)}</div><div class="stat-value">${esc(b)}</div><div class="stat-note">${esc(c||"")}</div></div>`}
async function getAll(name,constraints=[]){
  const q=query(collection(db,name),...constraints);const snap=await getDocs(q);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
function sortNewest(rows){return rows.sort((a,b)=>String(b.createdAt?.toDate?.()||b.date||"").localeCompare(String(a.createdAt?.toDate?.()||a.date||"")))}
function renderError(e){console.error(e);return `<div class="card"><div class="error">${esc(e?.message||e)}</div><p class="muted">If this is a Firebase permission/index error, check Firestore Rules and indexes from the supplied setup steps.</p></div>`}

async function render(v){
  active(v);const c=$("#content");c.innerHTML='<div class="card empty">Loading…</div>';
  try{
    const pages={dashboard,employees,attendance,leaves,applications,reports,employeeReport,locations,settings,audit,...Object.fromEntries(Object.keys(moduleDefs).map(k=>[k,()=>genericModule(k)]))};
    if(!pages[v])return;
    c.innerHTML=await pages[v]();wireActions();mountNotificationBell();
  }catch(e){c.innerHTML=layout("Module error","The page could not be loaded.",renderError(e));mountNotificationBell()}
}

async function dashboard(){
  const profile=currentProfile;
  if(!roleMgmt()){
    const [atts,leaves,apps]=await Promise.all([
      getAll("attendance",[where("employeeId","==",currentUser.uid),where("date","==",today()),limit(1)]),
      getAll("leaves",[where("employeeId","==",currentUser.uid),limit(50)]),
      getAll("applications",[where("employeeId","==",currentUser.uid),limit(50)])
    ]);
    const a=atts[0];
    return layout("My Dashboard","Your personal TVG workspace.",
      `<div class="dashboard-head"><div><div class="eyebrow">Employee Self Service</div><h1>Welcome, ${esc(profile.name||"Employee")}</h1><div class="muted">${esc(profile.department||"")} · ${esc(profile.designation||"")}</div></div><div class="dashboard-clock" id="liveClock"></div></div>
      <div class="grid stats dashboard-click-stats"><button class="stat-card-button" data-go="attendance">${stat("Today",a?(a.checkOut?"Completed":"On Duty"):"Not Marked",a?`${formatTime(a.checkIn)}${a.checkOut?" → "+formatTime(a.checkOut):""}`:"Attendance")}</button><button class="stat-card-button" data-go="leaves">${stat("Pending Leaves",leaves.filter(x=>x.status==="Pending").length,"Your requests")}</button><button class="stat-card-button" data-go="applications">${stat("Open Requests",apps.filter(x=>x.status==="Pending").length,"Your requests")}</button><button class="stat-card-button" data-action="profile">${stat("Employee ID",profile.employeeId||"—",roleLabel(currentRole()))}</button></div>
      <div class="grid two section"><div class="card"><div class="section-head"><h2>Quick Actions</h2></div><div class="module-list compact"><button data-go="attendance"><span>◷</span><b>Attendance</b><small>Check-in / check-out</small></button><button data-go="leaves"><span>◫</span><b>Apply Leave</b><small>Submit & track</small></button><button data-go="applications"><span>✉</span><b>New Request</b><small>HR / Operations</small></button><button data-action="profile"><span>♙</span><b>My Profile</b><small>Account & password</small></button></div></div>
      <div class="card"><div class="section-head"><h2>My Profile</h2></div><div class="profile-grid"><div class="profile-item"><small>Name</small><b>${esc(profile.name)}</b></div><div class="profile-item"><small>Employee ID</small><b>${esc(profile.employeeId)}</b></div><div class="profile-item"><small>Department</small><b>${esc(profile.department)}</b></div><div class="profile-item"><small>Location</small><b>${esc(profile.locationName||"Not assigned")}</b></div></div></div></div>`);
  }
  const [users,atts,leaves,apps,locations]=await Promise.all([
    getAll("users",[limit(500)]),getAll("attendance",[where("date","==",today()),limit(500)]),
    getAll("leaves",[limit(500)]),getAll("applications",[limit(500)]),getAll("locations",[limit(200)])
  ]);
  const activeUsers=users.filter(u=>String(u.status||"Active").toLowerCase()!=="inactive");
  const byId=new Map(locations.map(l=>[l.id,l]));
  const presentIds=new Set(atts.map(x=>x.employeeId));
  const onDuty=atts.filter(a=>!a.checkOut);
  const absent=activeUsers.filter(u=>!presentIds.has(u.uid||u.id));
  const inactive=users.filter(u=>String(u.status||"").toLowerCase()==="inactive");
  const pendingLeaves=leaves.filter(x=>x.status==="Pending"),pendingApps=apps.filter(x=>x.status==="Pending");
  const dutyRows=onDuty.map(a=>{const u=users.find(x=>(x.uid||x.id)===a.employeeId);const l=byId.get(a.locationId);return {a,u,l}});
  return layout("Management Dashboard","Clean operational overview — choose an option to open the exact data or action you need.",
    `<div class="dashboard-head"><div><div class="eyebrow">Operations Control Center</div><h1>TVG Workforce Dashboard</h1><div class="muted">${today()} · Pakistan time · ${appSettings.timeFormat==="12"?"12-hour":"24-hour"} clock</div></div><div class="dashboard-clock" id="liveClock"></div></div>
    <div class="grid stats dashboard-click-stats"><button class="stat-card-button" data-go="employees">${stat("Employees",activeUsers.length,"Active workforce")}</button><button class="stat-card-button" data-go="attendance">${stat("On Duty Now",onDuty.length,"Checked in · not checked out")}</button><button class="stat-card-button" data-action="notInToday">${stat("Not In Today",absent.length,"No attendance record")}</button><button class="stat-card-button" data-action="inactiveEmployees">${stat("Inactive",inactive.length,"Profiles disabled")}</button></div>
    <div class="grid two section"><div class="card"><div class="section-head"><div><h2>Active / Present Employees</h2><div class="muted">Currently checked in and not checked out.</div></div><button class="btn small" data-go="attendance">View all</button></div>
      <div class="duty-list">${dutyRows.slice(0,15).map(({a,u,l})=>`<div class="duty-row"><div class="avatar">${esc((u?.name||a.employeeName||"E").slice(0,1).toUpperCase())}</div><div class="duty-main"><b>${esc(u?.name||a.employeeName||a.employeeId)}</b><small>${esc(u?.employeeId||"")} · ${esc(l?.shopName||l?.name||u?.locationName||"Location not assigned")}</small></div><span class="status-dot"></span><span class="duty-time">${formatTime(a.checkIn)}</span>${u?.phone?`<a class="call-btn" href="${phoneHref(u.phone)}" title="Call ${esc(u.name)}">☎</a>`:""}</div>`).join("")||'<div class="empty">No employees are currently on duty.</div>'}</div></div>
    <div class="card"><div class="section-head"><div><h2>Quick Access</h2><div class="muted">All management options are available as clean, clickable actions.</div></div></div><div class="module-list"><button data-go="employees"><span>♙</span><b>Employees</b><small>Employee master & accounts</small></button><button data-go="locations"><span>⌖</span><b>Shops & Cities</b><small>Branches and assignments</small></button><button data-go="attendance"><span>◷</span><b>Attendance</b><small>Check-in, check-out & register</small></button><button data-go="leaves"><span>◫</span><b>Leaves</b><small>Requests and approvals</small></button><button data-go="applications"><span>✉</span><b>Applications</b><small>Employee requests</small></button><button data-go="reports"><span>▥</span><b>Reports</b><small>Overall, branch or employee</small></button><button data-go="employeeReport"><span>▤</span><b>Employee Reports</b><small>Detailed individual history</small></button><button data-go="payroll"><span>₨</span><b>Payroll Register</b><small>Salary, overtime & deductions</small></button><button data-go="assets"><span>▣</span><b>Assets</b><small>Company-issued assets</small></button><button data-go="audit"><span>✓</span><b>Audit Trail</b><small>Recorded management actions</small></button><button data-go="alerts"><span>◌</span><b>Alerts</b><small>Operational notifications</small></button><button data-go="settings"><span>⚙</span><b>Settings</b><small>Company and attendance settings</small></button></div></div></div>
    <div class="grid three section dashboard-action-links"><button class="card action-link" data-go="leaves"><b>Pending Leaves</b><strong>${pendingLeaves.length}</strong><span>Review employee leave requests</span></button><button class="card action-link" data-go="applications"><b>Open Applications</b><strong>${pendingApps.length}</strong><span>Review employee applications</span></button><button class="card action-link" data-go="employees"><b>Active Workforce</b><strong>${activeUsers.length}</strong><span>Open employee master</span></button></div>`
  );
}

async function employees(){
 if(!roleMgmt())return layout("Employees","Restricted module",'<div class="card empty">Only HR / Operations management can access employee records.</div>');
 const [users,locations]=await Promise.all([getAll("users",[limit(500)]),getAll("locations",[limit(200)])]);
 const lm=new Map(locations.map(l=>[l.id,l]));
 return layout("Employee Master","One-click employee directory with contact, role, shop assignment and account controls.",
 `<div class="toolbar"><button class="btn primary" data-action="employeeAdd">+ Add employee profile</button><button class="btn" data-action="passwordHelp">Account setup</button><input class="search" id="employeeSearch" placeholder="Search name, ID, phone, city…"></div>
 <div class="card directory-summary"><span><b>${users.length}</b> total profiles</span><span><b>${users.filter(u=>String(u.status||"Active")!=="Inactive").length}</b> active</span><span><b>${users.filter(u=>["admin","manager","hr"].includes(u.role)).length}</b> management</span></div>
 <div class="table-wrap"><table class="table" id="employeeTable"><thead><tr><th>Employee</th><th>Employee No.</th><th>Phone</th><th>Department / Designation</th><th>Shop / City</th><th>Role</th><th>Status</th><th>Account</th><th></th></tr></thead><tbody>
 ${users.map(u=>{const l=lm.get(u.locationId);return `<tr data-search="${esc(`${u.name||""} ${u.employeeId||""} ${u.phone||""} ${l?.city||""} ${l?.shopName||""}`.toLowerCase())}"><td><b>${esc(u.name||"—")}</b><br><span class="muted">${esc(u.email||"")}</span></td><td><span class="badge">${esc(u.employeeId||"—")}</span></td><td>${u.phone?`<a class="phone-link" href="${phoneHref(u.phone)}">${esc(u.phone)}</a>`:"—"}</td><td>${esc(u.department||"—")}<br><span class="muted">${esc(u.designation||"—")}</span></td><td>${esc(l?.shopName||u.locationName||"Not assigned")}<br><span class="muted">${esc(l?.city||"")}</span></td><td><span class="badge">${esc(roleLabel(u.role))}</span></td><td class="${String(u.status||"Active")==="Inactive"?"status-bad":"status-good"}">${esc(u.status||"Active")}</td><td><button class="btn small" data-action="passwordReset" data-id="${esc(u.id)}">Reset</button></td><td><div class="actions"><button class="btn small" data-action="openEmployeeReport" data-id="${esc(u.uid||u.id)}">Report</button><button class="btn small" data-action="editEmployee" data-id="${esc(u.id)}">Edit</button></div></td></tr>`}).join("")||'<tr><td colspan="9" class="empty">No employee profiles.</td></tr>'}</tbody></table></div>`);
}

async function attendance(){
 const mine=!roleMgmt();
 const rows=mine?await getAll("attendance",[where("employeeId","==",currentUser.uid),limit(100)]):await getAll("attendance",[where("date","==",today()),limit(500)]);
 const existing=mine?rows.find(x=>x.date===today()):null;
 return layout("Attendance Management",mine?"Location-based employee attendance.":"Daily attendance register and location evidence.",
 `<div class="grid ${mine?"two":"one"}">
 ${mine?`<div class="card"><div class="section-head"><h2>Today's attendance</h2><span class="badge">${existing?.status||"Not marked"}</span></div><div class="attendance-big">${formatTime(existing?.checkIn)}</div><p class="muted">${existing?.checkOut?"Checked out at "+esc(existing.checkOut):existing?"Checked in — checkout when your shift ends":"Check your factory location before marking attendance."}</p><div id="geoStatus" class="check-card">Location has not been checked.</div><div class="actions" style="margin-top:12px">${!existing?'<button class="btn" data-action="checkLocation">Check location</button><button class="btn primary" data-action="markAttendance">Mark check-in</button>':existing&&!existing.checkOut?'<button class="btn" data-action="checkLocation">Verify location</button><button class="btn primary" data-action="checkOut">Mark check-out</button>':'<span class="status-good">Today is complete.</span>'}</div></div>`:""}
 ${mine?`<div class="card"><h2>Attendance policy</h2><div class="kpi"><span>Factory geofence</span><b>Required</b></div><div class="kpi"><span>Check-in</span><b>GPS + time</b></div><div class="kpi"><span>Check-out</span><b>GPS + time</b></div><p class="muted">Browser geolocation is an operational control, not a tamper-proof device attestation.</p></div>`:
 `<div class="card"><div class="section-head"><div><h2>Today — ${today()}</h2><div class="muted">GPS attendance plus management-entered records for employees who cannot use the app.</div></div><div class="actions"><button class="btn primary" data-action="manualAttendanceAdd">+ Management Entry</button><button class="btn" data-action="exportAttendance">Export CSV</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Employee</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Source</th><th>Location</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.employeeName)}</td><td>${formatTime(a.checkIn)}</td><td>${formatTime(a.checkOut)}</td><td>${esc(a.workHours||"—")}</td><td><span class="badge">${esc(a.source||"App / GPS")}</span></td><td>${a.distanceMeters!=null?Math.round(a.distanceMeters)+"m":a.manualReason?esc(a.manualReason):"—"}</td><td class="${a.status==="Present"?"status-good":a.status==="Absent"?"status-bad":"status-warn"}">${esc(a.status||"Present")}</td><td><button class="btn small" data-action="manualAttendanceEdit" data-id="${esc(a.id)}">Edit</button></td></tr>`).join("")||'<tr><td colspan="8" class="empty">No records today.</td></tr>'}</tbody></table></div></div>`}
 </div>
 ${mine?`<div class="card section"><h2>My attendance history</h2><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Distance</th></tr></thead><tbody>${rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60).map(a=>`<tr><td>${esc(a.date)}</td><td>${formatTime(a.checkIn)}</td><td>${formatTime(a.checkOut)}</td><td>${esc(a.workHours||"—")}</td><td>${a.distanceMeters?Math.round(a.distanceMeters)+"m":"—"}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">No attendance history.</td></tr>'}</tbody></table></div></div>`:""}`);
}

function monthKey(value){const s=String(value||"");return /^\d{4}-\d{2}/.test(s)?s.slice(0,7):"Unknown"}
function monthLabel(key){if(key==="Unknown")return "Unclassified";const [y,m]=key.split("-").map(Number);return new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric",timeZone:"Asia/Karachi"}).format(new Date(Date.UTC(y,m-1,1)))}
function groupByMonth(rows,getDate){const groups={};rows.forEach(x=>{const k=monthKey(getDate(x));(groups[k]??=[]).push(x)});return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));}
function notificationDate(n){try{return n.createdAt?.toDate?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Karachi",dateStyle:"medium",timeStyle:"short"}).format(n.createdAt.toDate()):`${n.date||""} ${n.time||""}`.trim()}catch(_e){return n.date||""}}
function notificationButton(){const unread=notificationCache.filter(n=>!n.read).length;return `<div class="notification-wrap"><button class="icon-btn notification-btn" data-action="toggleNotifications" title="Notifications">🔔${unread?`<span class="notification-badge">${unread>99?'99+':unread}</span>`:''}</button><div id="notificationPanel" class="notification-panel hidden"></div></div>`}
function mountNotificationBell(){const host=$("#notificationBellHost");if(host){host.innerHTML=notificationButton();wireActions()}}
function renderNotificationPanel(){const p=$("#notificationPanel");if(!p)return;const rows=notificationCache.slice(0,30);p.innerHTML=`<div class="notification-head"><b>Notifications</b><button class="link-btn" data-action="markAllNotifications">Mark all read</button></div>${rows.map(n=>`<button class="notification-item ${n.read?'':'unread'}" data-action="openNotification" data-id="${esc(n.id)}"><span class="notification-dot"></span><span><b>${esc(n.title||'TVG Update')}</b><small>${esc(n.message||'')}</small><em>${esc(notificationDate(n))}</em></span></button>`).join('')||'<div class="notification-empty">You are all caught up.</div>'}`;p.onclick=e=>e.stopPropagation();wireActions()}
function stopNotificationListener(){if(notificationUnsub)notificationUnsub();notificationUnsub=null;notificationStarted=false;notificationCache=[];const h=$("#notificationBellHost");if(h)h.innerHTML=""}
function startNotificationListener(){if(notificationStarted||!currentUser)return;notificationStarted=true;try{notificationUnsub=onSnapshot(query(collection(db,"notifications"),where("recipientId","==",currentUser.uid),limit(100)),snap=>{notificationCache=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt?.toDate?.()||b.date||'').localeCompare(String(a.createdAt?.toDate?.()||a.date||'')));mountNotificationBell()},err=>{console.warn('TVG notification listener unavailable',err);notificationStarted=false})}catch(e){console.warn('TVG notification listener setup failed',e);notificationStarted=false}}
async function createNotification(recipientId,title,message,meta={}){if(!recipientId)return;try{await addDoc(collection(db,"notifications"),{recipientId,title,message,type:meta.type||'system',entity:meta.entity||'',entityId:meta.entityId||'',read:false,date:today(),createdAt:serverTimestamp()})}catch(e){console.warn('Notification write failed',e)}}
async function notifyManagement(title,message,meta={}){try{const users=await getAll('users',[limit(500)]);await Promise.all(users.filter(u=>['admin','manager','hr'].includes(String(u.role||'').toLowerCase())&&String(u.status||'Active').toLowerCase()!=='inactive').map(u=>createNotification(u.uid||u.id,title,message,meta)))}catch(e){console.warn('Management notification failed',e)}}
async function notifyEmployee(uid,title,message,meta={}){return createNotification(uid,title,message,meta)}
async function markNotificationRead(id){const n=notificationCache.find(x=>x.id===id);if(!n||n.read)return;await updateDoc(doc(db,'notifications',id),{read:true,readAt:serverTimestamp()})}
async function markAllNotifications(){await Promise.all(notificationCache.filter(n=>!n.read).map(n=>updateDoc(doc(db,'notifications',n.id),{read:true,readAt:serverTimestamp()})));toast('All notifications marked as read.');mountNotificationBell()}
async function openNotification(id){const n=notificationCache.find(x=>x.id===id);if(!n)return;await markNotificationRead(id);mountNotificationBell();if(n.entity==='leaves')return render('leaves');if(n.entity==='applications')return render('applications');if(n.entity==='attendance')return render('attendance');if(n.entity==='employee')return render('employees')}
async function cancelWorkflow(type,id){const snap=await getDoc(doc(db,type,id));if(!snap.exists())return;const x=snap.data();if(x.employeeId!==currentUser.uid||x.status!=='Pending')return toast('Only your pending request can be cancelled.');if(!confirm('Cancel this pending request?'))return;await updateDoc(doc(db,type,id),{status:'Cancelled',cancelledAt:serverTimestamp(),cancelledBy:currentUser.uid});await notifyManagement(`${type==='leaves'?'Leave':'Application'} cancelled`,`${currentProfile.name} cancelled a pending ${type==='leaves'?'leave request':'application'}.`,{type:'workflow',entity:type,entityId:id});await writeAudit('CANCEL',type,id);toast('Request cancelled.');render(type)}
async function actionCenter(){
 if(!roleMgmt())return '';
 try{
  const [leaves,apps]=await Promise.all([getAll('leaves',[limit(500)]),getAll('applications',[limit(500)])]);
  const queue=[...leaves.filter(x=>x.status==='Pending').map(x=>({...x,_kind:'Leave',_date:x.from||x.date||''})),...apps.filter(x=>x.status==='Pending').map(x=>({...x,_kind:'Application',_date:x.date||''}))].sort((a,b)=>String(a._date).localeCompare(String(b._date))).slice(0,10);
  return `<div class="card section action-center"><div class="section-head"><div><h2>Operational Control Center</h2><div class="muted">Pending employee actions requiring management attention.</div></div><div class="actions"><button class="btn small" data-go="leaves">Leave archive</button><button class="btn small" data-go="applications">Request archive</button></div></div>${queue.map(x=>`<div class="action-row"><div><span class="badge">${esc(x._kind)}</span><b>${esc(x.employeeName||'Employee')}</b><small>${esc(x.type||x.subject||'')} · ${esc(x._date)}</small></div><button class="btn small primary" data-action="${x._kind==='Leave'?'leaveReview':'appReview'}" data-id="${x.id}">Review</button></div>`).join('')||'<div class="empty">No pending approvals. The control center is clear.</div>'}</div>`;
 }catch(e){return `<div class="card section"><div class="error">Control Center unavailable: ${esc(e.message||e)}</div></div>`}
}

async function leaves(){
 const mine=!roleMgmt();let rows=mine?await getAll("leaves",[where("employeeId","==",currentUser.uid),limit(500)]):await getAll("leaves",[limit(1000)]);
 rows.sort((a,b)=>String(b.from||"").localeCompare(String(a.from||"")));
 const groups=groupByMonth(rows,x=>x.from);
 const currentMonth=today().slice(0,7);
 const total=rows.length,pending=rows.filter(x=>x.status==="Pending").length,approved=rows.filter(x=>x.status==="Approved").length,rejected=rows.filter(x=>x.status==="Rejected").length;
 return layout("Leave Management",mine?"Submit and track your leave requests.":"Professional leave register, monthly archive and approval queue.",
 `<div class="grid four section mini-stats">${stat("Total",total,"All leave records")}${stat("Pending",pending,"Awaiting management")}${stat("Approved",approved,"Confirmed leave")}${stat("Rejected",rejected,"Not approved")}</div>
 <div class="toolbar"><button class="btn primary" data-action="leaveAdd">+ New leave</button>${roleMgmt()?`<button class="btn" data-action="manualLeaveAdd">+ Management Entry</button>`:""}<input class="search" id="leaveSearch" placeholder="Search employee, type, reason…"><select class="search" id="leaveStatusFilter"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option><option>Cancelled</option></select><button class="btn" data-action="exportLeaves">Export CSV</button></div>
 <div id="leaveArchive" class="archive-list">${groups.map(([month,items])=>`<details class="archive-folder" ${month===currentMonth?'open':''}><summary><span>${esc(monthLabel(month))}</span><span class="badge">${items.length} record${items.length===1?'':'s'}</span></summary><div class="table-wrap"><table class="table"><thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(x=>`<tr data-search="${esc(`${x.employeeName||''} ${x.type||''} ${x.reason||''} ${x.from||''}`.toLowerCase())}" data-status="${esc(x.status||'')}"><td>${esc(x.employeeName)}</td><td>${esc(x.type)}</td><td>${esc(x.from)}</td><td>${esc(x.to)}</td><td>${esc(x.days)}</td><td>${esc(x.reason)}</td><td class="${x.status==='Approved'?'status-good':x.status==='Rejected'?'status-bad':x.status==='Cancelled'?'':'status-warn'}">${esc(x.status)}</td><td>${roleMgmt()&&x.status==='Pending'?`<button class="btn small" data-action="leaveReview" data-id="${x.id}">Review</button>`:''}${mine&&x.status==='Pending'?`<button class="btn small danger" data-action="leaveCancel" data-id="${x.id}">Cancel</button>`:''}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">No records in this month.</td></tr>'}</tbody></table></div></details>`).join('')||'<div class="card empty">No leave records yet.</div>'}</div>`);
}async function applications(){
 const mine=!roleMgmt();let rows=mine?await getAll("applications",[where("employeeId","==",currentUser.uid),limit(500)]):await getAll("applications",[limit(1000)]);
 rows.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 const groups=groupByMonth(rows,x=>x.date),currentMonth=today().slice(0,7);
 const total=rows.length,pending=rows.filter(x=>x.status==="Pending").length,approved=rows.filter(x=>x.status==="Approved").length,rejected=rows.filter(x=>x.status==="Rejected").length;
 return layout("Employee Applications",mine?"Submit and track HR / operations requests.":"Professional request register, monthly archive and approval queue.",
 `<div class="grid four section mini-stats">${stat("Total",total,"All request records")}${stat("Pending",pending,"Awaiting management")}${stat("Approved",approved,"Completed approvals")}${stat("Rejected",rejected,"Not approved")}</div>
 <div class="toolbar"><button class="btn primary" data-action="appAdd">+ Submit application</button>${roleMgmt()?`<button class="btn" data-action="manualAppAdd">+ Management Entry</button>`:""}<input class="search" id="appSearch" placeholder="Search employee, subject, category…"><select class="search" id="appStatusFilter"><option value="">All statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option><option>Cancelled</option></select><button class="btn" data-action="exportApplications">Export CSV</button></div>
 <div id="appArchive" class="archive-list">${groups.map(([month,items])=>`<details class="archive-folder" ${month===currentMonth?'open':''}><summary><span>${esc(monthLabel(month))}</span><span class="badge">${items.length} record${items.length===1?'':'s'}</span></summary><div class="table-wrap"><table class="table"><thead><tr><th>Employee</th><th>Category</th><th>Subject</th><th>Date</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(x=>`<tr data-search="${esc(`${x.employeeName||''} ${x.category||''} ${x.subject||''} ${x.date||''}`.toLowerCase())}" data-status="${esc(x.status||'')}"><td>${esc(x.employeeName)}</td><td>${esc(x.category)}</td><td>${esc(x.subject)}</td><td>${esc(x.date)}</td><td class="${x.status==='Approved'?'status-good':x.status==='Rejected'?'status-bad':x.status==='Cancelled'?'':'status-warn'}">${esc(x.status)}</td><td>${roleMgmt()&&x.status==='Pending'?`<button class="btn small" data-action="appReview" data-id="${x.id}">Review</button>`:''}${mine&&x.status==='Pending'?`<button class="btn small danger" data-action="appCancel" data-id="${x.id}">Cancel</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No records in this month.</td></tr>'}</tbody></table></div></details>`).join('')||'<div class="card empty">No applications yet.</div>'}</div>`);
}
async function reports(){
 if(!roleMgmt())return layout("Reports","Restricted module",'<div class="card empty">Management access required.</div>');
 const [users,locations]=await Promise.all([getAll("users",[limit(1000)]),getAll("locations",[limit(300)])]);
 const active=users.filter(u=>String(u.status||"Active")!=="Inactive");
 const branchOptions=locations.map(l=>`<option value="${esc(l.id)}">${esc(l.shopName||l.name||"Shop")} — ${esc(l.city||"")}</option>`).join("");
 const employeeOptions=active.map(u=>`<option value="${esc(u.uid||u.id)}">${esc(u.employeeId||"")} — ${esc(u.name||"")}</option>`).join("");
 return layout("HR Reports & Control","Choose exactly what management wants to see, generate it, review the rows, then export CSV/Excel or print/save as PDF.",
 `<div class="card report-builder"><div class="section-head"><div><h2>Report Builder</h2><div class="muted">Select a scope and period. Nothing is generated until you press Generate Report.</div></div><span class="badge">Management only</span></div>
 <div class="form-grid">
 <label>Report Scope<select id="reportScope"><option value="overall">Overall Business</option><option value="branch">Branch / Shop</option><option value="employee">Specific Employee</option></select></label>
 <label>Report Type<select id="reportType"><option value="workforce">Workforce & Attendance</option><option value="salary">Salary / Working Hours</option><option value="financial">Assets + Advances + Loans</option><option value="complete">Complete Employee / HR</option></select></label>
 <label id="reportBranchWrap" class="hidden">Branch / Shop<select id="reportBranch"><option value="">Select branch</option>${branchOptions}</select></label>
 <label id="reportEmployeeWrap" class="hidden">Employee<select id="reportEmployeeSelect"><option value="">Select employee</option>${employeeOptions}</select></label>
 <label>From<input id="reportFrom" type="date" value="${today().slice(0,7)}-01"></label>
 <label>To<input id="reportTo" type="date" value="${today()}"></label>
 </div>
 <div class="actions report-actions"><button class="btn primary" data-action="generateManagementReport">Generate Report</button><button class="btn" data-action="exportGeneratedReport" data-id="csv">Download CSV</button><button class="btn" data-action="exportGeneratedReport" data-id="excel">Download Excel</button><button class="btn" data-action="printPage">Print / Save PDF</button></div></div>
 <div id="managementReportResult" class="section"><div class="card empty">Select your report scope and press <b>Generate Report</b>.</div></div>`);
}

async function buildManagementReport(){
 const scope=$("#reportScope")?.value||"overall", type=$("#reportType")?.value||"workforce", branchId=$("#reportBranch")?.value||"", employeeId=$("#reportEmployeeSelect")?.value||"", from=$("#reportFrom")?.value||"0000-01-01", to=$("#reportTo")?.value||"9999-12-31";
 if(scope==="branch"&&!branchId)throw new Error("Select a branch / shop.");
 if(scope==="employee"&&!employeeId)throw new Error("Select an employee.");
 const [users,locations,atts,leaves,apps,assets,finance]=await Promise.all([
  getAll("users",[limit(1000)]),getAll("locations",[limit(300)]),getAll("attendance",[limit(5000)]),getAll("leaves",[limit(2000)]),getAll("applications",[limit(2000)]),getAll("assets",[limit(2000)]),getAll("employeeFinance",[limit(2000)]).catch(()=>[])
 ]);
 const lm=new Map(locations.map(l=>[l.id,l])), active=users.filter(u=>String(u.status||"Active")!=="Inactive");
 let selected=active;
 if(scope==="branch")selected=active.filter(u=>u.locationId===branchId);
 if(scope==="employee")selected=active.filter(u=>(u.uid||u.id)===employeeId);
 const ids=new Set(selected.map(u=>u.uid||u.id));
 const ar=atts.filter(a=>ids.has(a.employeeId)&&String(a.date||"")>=from&&String(a.date||"")<=to);
 const lr=leaves.filter(x=>ids.has(x.employeeId)&&String(x.from||"")<=to&&String(x.to||"")>=from);
 const ap=apps.filter(x=>ids.has(x.employeeId)&&String(x.date||"")>=from&&String(x.date||"")<=to);
 const as=assets.filter(x=>{const id=x.employeeId||x.assignedEmployeeId;return (id&&ids.has(id))||(!id&&selected.some(u=>String(x.employeeName||"").trim().toLowerCase()===String(u.name||"").trim().toLowerCase()));});
 const fn=finance.filter(x=>ids.has(x.employeeId));
 const rows=selected.map(u=>{
   const uid=u.uid||u.id, ua=ar.filter(a=>a.employeeId===uid), ul=lr.filter(x=>x.employeeId===uid), ua2=ap.filter(x=>x.employeeId===uid), uf=fn.filter(x=>x.employeeId===uid), us=as.filter(x=>(x.employeeId||x.assignedEmployeeId)===uid||(!(x.employeeId||x.assignedEmployeeId)&&String(x.employeeName||"").trim().toLowerCase()===String(u.name||"").trim().toLowerCase()));
   const hours=ua.reduce((n,a)=>n+(Number(a.workHours)||0),0), advances=uf.filter(x=>x.type==="Advance").reduce((n,x)=>n+(Number(x.amount)||0),0), advancePaid=uf.filter(x=>x.type==="Advance").reduce((n,x)=>n+(Number(x.paidAmount)||0),0), loans=uf.filter(x=>x.type==="Loan").reduce((n,x)=>n+(Number(x.amount)||0),0), loanPaid=uf.filter(x=>x.type==="Loan").reduce((n,x)=>n+(Number(x.paidAmount)||0),0), outstanding=Math.max(0,advances+loans-advancePaid-loanPaid), deductions=Number(u.manualDeductions||0), commission=Number(u.manualCommission||0), overtime=ua.reduce((n,a)=>n+(Number(a.workHours)>0?Math.max(0,Number(a.workHours)-8):0),0), overtimeAmount=overtime*Number(u.overtimeRate||0), base=Number(u.baseSalary||0), net=Math.max(0,base+Number(u.allowances||0)+commission+overtimeAmount-deductions-outstanding);
   const loc=lm.get(u.locationId);
   return {employeeId:u.employeeId||"",name:u.name||"",department:u.department||"",designation:u.designation||"",branch:loc?.shopName||u.locationName||"",city:loc?.city||"",status:u.status||"Active",present:ua.length,checkedOut:ua.filter(a=>a.checkOut).length,totalHours:hours,leaves:ul.length,approvedLeaves:ul.filter(x=>x.status==="Approved").length,applications:ua2.length,assets:us.length,assetList:us.map(x=>`${x.assetType||"Asset"} (${x.assetTag||"—"})`).join("; "),advances,advancePaid,loans,loanPaid,outstanding,baseSalary:base,allowances:Number(u.allowances||0),overtimeHours:overtime,overtimeAmount,deductions,commission,estimatedNet:net};
 });
 return {scope,type,from,to,rows,meta:{users:selected.length,attendance:ar.length,leaves:lr.length,applications:ap.length,assets:as.length,finance:fn.length}};
}
function renderManagementReport(r){
 const title={overall:"Overall Business",branch:"Branch / Shop",employee:"Specific Employee"}[r.scope];
 let heads=["employeeId","name","branch","city","department","designation","present","checkedOut","totalHours","leaves","approvedLeaves","applications","assets","advances","advancePaid","loans","loanPaid","outstanding","baseSalary","overtimeHours","overtimeAmount","deductions","commission","estimatedNet"];
 if(r.type==="workforce") heads=["employeeId","name","branch","city","department","designation","present","checkedOut","totalHours","leaves","approvedLeaves","applications"];
 if(r.type==="salary") heads=["employeeId","name","branch","present","totalHours","baseSalary","overtimeHours","overtimeAmount","deductions","commission","estimatedNet"];
 if(r.type==="financial") heads=["employeeId","name","branch","assets","assetList","advances","advancePaid","loans","loanPaid","outstanding"];
 const labels={employeeId:"Employee ID",name:"Employee",branch:"Branch",city:"City",department:"Department",designation:"Designation",present:"Present",checkedOut:"Checked Out",totalHours:"Hours",leaves:"Leaves",approvedLeaves:"Approved Leaves",applications:"Applications",assets:"Assets",advances:"Advances",advancePaid:"Advance Paid",loans:"Loans",loanPaid:"Loan Paid",outstanding:"Pending Balance",baseSalary:"Salary",overtimeHours:"OT Hours",overtimeAmount:"OT Amount",deductions:"Deductions",commission:"Commission",estimatedNet:"Estimated Net"};
 const body=r.rows.map(x=>`<tr>${heads.map(k=>`<td>${esc(x[k]??"")}</td>`).join("")}</tr>`).join("");
 const totalOutstanding=r.rows.reduce((n,x)=>n+x.outstanding,0),totalNet=r.rows.reduce((n,x)=>n+x.estimatedNet,0);
 return `<div class="card report-result"><div class="section-head"><div><h2>${esc(title)} Report</h2><div class="muted">${esc(r.from)} → ${esc(r.to)} · ${r.rows.length} employee${r.rows.length===1?"":"s"}</div></div><div class="actions"><span class="badge">${r.meta.attendance} attendance</span><span class="badge">${r.meta.assets} assets</span><span class="badge">${r.meta.finance} finance records</span></div></div><div class="grid four mini-stats"><div class="card"><div class="stat-label">Employees</div><div class="stat-value">${r.rows.length}</div></div><div class="card"><div class="stat-label">Hours</div><div class="stat-value">${r.rows.reduce((n,x)=>n+x.totalHours,0).toFixed(2)}</div></div><div class="card"><div class="stat-label">Pending Balances</div><div class="stat-value">${totalOutstanding.toFixed(2)}</div></div><div class="card"><div class="stat-label">Estimated Net</div><div class="stat-value">${totalNet.toFixed(2)}</div></div></div><div class="table-wrap"><table class="table report-data-table"><thead><tr>${heads.map(k=>`<th>${labels[k]}</th>`).join("")}</tr></thead><tbody>${body||`<tr><td colspan="${heads.length}" class="empty">No records matched your selected filters.</td></tr>`}</tbody></table></div></div>`;
}
async function employeeReport(){
 if(!roleMgmt())return layout("Employee Report","Restricted module",'<div class="card empty">Management access required.</div>');
 const users=await getAll("users",[limit(500)]);
 const now=new Date(), ym=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit"}).format(now);
 return layout("Employee Attendance & Salary Report","Select an employee and month to see hours, attendance, leaves and salary-period facts in one place.",
 `<div class="card"><div class="form-grid"><label>Employee<select id="reportEmployee"><option value="">Select employee</option>${users.map(u=>`<option value="${esc(u.uid||u.id)}">${esc(u.employeeId||"")} — ${esc(u.name||"")}</option>`).join("")}</select></label><label>Month<input id="reportMonth" type="month" value="${ym}"></label></div><div class="actions" style="margin-top:14px"><button class="btn primary" data-action="runEmployeeReport">Generate report</button><button class="btn" data-action="printPage">Print / Save PDF</button></div></div><div id="employeeReportResult" class="section"></div>`);
}

async function buildEmployeeReport(uid,month){
 if(!uid||!month)throw new Error("Select an employee and month.");
 const [users,atts,leaves]=await Promise.all([getAll("users",[limit(500)]),getAll("attendance",[where("employeeId","==",uid),limit(1000)]),getAll("leaves",[where("employeeId","==",uid),limit(200)])]);
 const u=users.find(x=>(x.uid||x.id)===uid);if(!u)throw new Error("Employee profile not found.");
 const [y,m]=month.split("-").map(Number),days=new Date(y,m,0).getDate(),start=`${month}-01`,end=`${month}-${String(days).padStart(2,"0")}`;
 const ar=atts.filter(a=>a.date>=start&&a.date<=end).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const lr=leaves.filter(l=>String(l.from||"")<=end&&String(l.to||"")>=start);
 const totalHours=ar.reduce((n,a)=>n+(Number(a.workHours)||0),0),present=ar.length,checkedOut=ar.filter(a=>a.checkOut).length;
 const late=ar.filter(a=>{const shift=appSettings.shiftStart||"09:00";return toMinutes(a.checkIn)>toMinutes(shift)+(Number(appSettings.graceMinutes)||0)}).length;
 const approvedLeaveDays=lr.filter(l=>l.status==="Approved").reduce((n,l)=>n+(Number(l.days)||0),0);
 const offName=String(u.weeklyOff||appSettings.weeklyOff||"Sunday").toLowerCase();let workingDays=0;for(let d=1;d<=days;d++){const dt=new Date(Date.UTC(y,m-1,d));const weekday=new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"UTC"}).format(dt).toLowerCase();if(weekday!==offName)workingDays++}
 const absentDays=Math.max(workingDays-present-approvedLeaveDays,0);
 const salaryType=String(u.salaryType||"Monthly"),base=Number(u.baseSalary||0),dailyRate=base/(Math.max(workingDays,1));
 const attendanceValue=salaryType==="Hourly"?totalHours*base:(salaryType==="Daily"?present*dailyRate:base);
 const deductions=Number(u.manualDeductions||0);
 const shiftMinutes=Math.max(0,toMinutes(appSettings.shiftEnd||"18:00")-toMinutes(appSettings.shiftStart||"09:00"));
 const scheduledHours=shiftMinutes/60||8;
 const overtimeHours=Math.max(totalHours-(present*scheduledHours),0),overtimeAmount=overtimeHours*Number(u.overtimeRate||0),commissionAmount=Number(u.manualCommission||0),netEstimate=Math.max(0,attendanceValue+Number(u.allowances||0)+overtimeAmount+commissionAmount-deductions);
 return {u,ar,lr,totalHours,present,checkedOut,late,days,workingDays,approvedLeaveDays,absentDays,dailyRate,attendanceValue,deductions,overtimeHours,overtimeAmount,commissionAmount,netEstimate};
}
async function renderEmployeeReport(uid,month){
 const r=await buildEmployeeReport(uid,month);const u=r.u;
 const activities=await getAll("employeeActivities",[where("employeeId","==",uid),limit(200)]).catch(()=>[]);
 const monthActivities=activities.filter(a=>monthKey(a.date)===String(month));
 const rows=r.ar.map(a=>`<tr><td>${esc(a.date)}</td><td>${formatTime(a.checkIn)}</td><td>${formatTime(a.checkOut)}</td><td>${esc(a.workHours||"—")}</td><td>${esc(a.status||"Present")}</td><td><span class="badge">${esc(a.source||"App / GPS")}</span></td>${roleMgmt()?`<td><button class="btn small" data-action="manualAttendanceEdit" data-id="${esc(a.id)}">Edit</button></td>`:""}</tr>`).join("");
 return `<div class="report-sheet"><div class="report-head"><div><h2>${esc(u.name)}</h2><div class="muted">${esc(u.employeeId||"")} · ${esc(u.department||"")} · ${esc(u.designation||"")}</div></div><div><b>${esc(u.phone||"No phone")}</b>${u.phone?`<a class="btn small" href="${phoneHref(u.phone)}">☎ Call</a>`:""}</div></div><div class="grid stats"><div class="card"><div class="stat-label">Present</div><div class="stat-value">${r.present}</div></div><div class="card"><div class="stat-label">Total Hours</div><div class="stat-value">${r.totalHours.toFixed(2)}</div></div><div class="card"><div class="stat-label">Checked Out</div><div class="stat-value">${r.checkedOut}</div></div><div class="card"><div class="stat-label">Late</div><div class="stat-value">${r.late}</div></div><div class="card"><div class="stat-label">Absent</div><div class="stat-value">${r.absentDays}</div></div></div><div class="grid two section"><div class="card"><h2>Leave records</h2>${r.lr.map(l=>`<div class="kpi"><span>${esc(l.type)} · ${esc(l.from)} → ${esc(l.to)}</span><b>${esc(l.status)}</b></div>`).join("")||'<div class="empty">No leave records in this period.</div>'}</div><div class="card"><h2>Salary-period summary</h2><div class="kpi"><span>Calendar days</span><b>${r.days}</b></div><div class="kpi"><span>Attendance days</span><b>${r.present}</b></div><div class="kpi"><span>Leave records</span><b>${r.lr.length}</b></div><div class="kpi"><span>Total worked hours</span><b>${r.totalHours.toFixed(2)}</b></div><div class="kpi"><span>Late arrivals</span><b>${r.late}</b></div><div class="kpi"><span>Configured salary</span><b>${Number(r.u.baseSalary||0).toFixed(2)}</b></div><div class="kpi"><span>Overtime hours</span><b>${r.overtimeHours.toFixed(2)}</b></div><div class="kpi"><span>Overtime amount</span><b>${r.overtimeAmount.toFixed(2)}</b></div><div class="kpi"><span>Deductions</span><b>${r.deductions.toFixed(2)}</b></div><div class="kpi"><span>Commission / incentive</span><b>${r.commissionAmount.toFixed(2)}</b></div><div class="kpi"><span>Estimated net</span><b>${r.netEstimate.toFixed(2)}</b></div><p class="muted">Calculations use TVG-configured fields and manual adjustments only. Statutory/tax rules are not assumed.</p></div></div><div class="card section"><div class="section-head"><div><h2>Daily attendance</h2><div class="muted">GPS records and management/manual entries are shown together.</div></div><div class="actions">${roleMgmt()?`<button class="btn primary" data-action="manualAttendanceAdd">+ Attendance Entry</button><button class="btn" data-action="activityAdd">+ Activity / Note</button>`:""}<button class="btn small" data-action="exportEmployeeReport" data-id="${esc(u.uid||u.id)}|${esc(month)}">Export CSV</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Status</th><th>Source</th>${roleMgmt()?"<th></th>":""}</tr></thead><tbody>${rows||`<tr><td colspan="${roleMgmt()?7:6}" class="empty">No attendance records for this month.</td></tr>`}</tbody></table></div></div><div class="card section"><div class="section-head"><div><h2>Employee activity history</h2><div class="muted">Useful when the employee was unable to use the app and management had to record activity manually.</div></div>${roleMgmt()?`<button class="btn primary" data-action="activityAdd">+ Add activity</button>`:""}</div>${monthActivities.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(a=>`<div class="kpi"><span><b>${esc(a.date)} ${esc(a.time||"")}</b> · ${esc(a.type||"Activity")}<br><small>${esc(a.details||"")}</small></span><span class="badge">${esc(a.source||"Management Manual")}</span></div>`).join("")||'<div class="empty">No manual activity records for this month.</div>'}</div></div>`;
}

async function locations(){
 if(!roleMgmt())return layout("Shops & Locations","Restricted module",'<div class="card empty">Management access required.</div>');
 const rows=await getAll("locations",[limit(200)]),users=await getAll("users",[limit(500)]);
 return layout("Shops & Locations","Create city-wise shop locations and assign employees to each branch.",
 `<div class="toolbar"><button class="btn primary" data-action="locationAdd">+ Add shop</button></div><div class="grid three">${rows.map(l=>{const count=users.filter(u=>u.locationId===l.id&&String(u.status||"Active")!=="Inactive").length;return `<div class="card location-card"><div class="location-icon">⌖</div><h2>${esc(l.shopName||l.name||"Shop")}</h2><div class="muted">${esc(l.city||"")}</div><p class="muted">${esc(l.address||"")}</p><div class="kpi"><span>Employees</span><b>${count}</b></div><div class="actions"><button class="btn small" data-action="locationEdit" data-id="${esc(l.id)}">Edit</button><button class="btn small" data-action="locationDelete" data-id="${esc(l.id)}">Delete</button></div></div>`}).join("")||'<div class="card empty">No shops configured yet.</div>'}</div>`);
}

async function settings(){
 if(!roleMgmt())return layout("Settings","Restricted module",'<div class="card empty">Management access required.</div>');
 const s=await getDoc(doc(db,"settings","general"));const x=s.exists()?s.data():{};
 return layout("System Settings","TVG organization, attendance, shift and display preferences.",
 `<form id="settingsForm" class="card"><div class="form-grid"><label>Organization name<input name="name" value="${esc(x.name||"TVG")}" required></label><label>Time display<select name="timeFormat"><option value="24" ${(x.timeFormat||"24")==="24"?"selected":""}>24-hour (18:30)</option><option value="12" ${(x.timeFormat||"")==="12"?"selected":""}>12-hour (6:30 PM)</option></select></label><label>Attendance radius (meters)<input name="radius" type="number" min="20" value="${x.radiusMeters||150}" required></label><label>Default shift start<input name="shiftStart" type="time" value="${esc(x.shiftStart||"09:00")}"></label><label>Default shift end<input name="shiftEnd" type="time" value="${esc(x.shiftEnd||"18:00")}"></label><label>Grace minutes<input name="grace" type="number" min="0" value="${x.graceMinutes??15}"></label><label>Weekly off<input name="weeklyOff" value="${esc(x.weeklyOff||"Sunday")}"></label></div><div class="actions" style="margin-top:14px"><button class="btn primary">Save settings</button></div></form>
 <div class="grid two section"><div class="card"><h2>Factory GPS</h2><p class="muted">Use the shop/location module for city-wise branches. This coordinate remains the default attendance zone for legacy attendance records.</p><div class="form-grid"><label>Latitude<input id="factoryLat" type="number" step="any" value="${x.lat??""}"></label><label>Longitude<input id="factoryLng" type="number" step="any" value="${x.lng??""}"></label></div><div class="actions" style="margin-top:12px"><button type="button" class="btn" data-action="captureFactory">Use current location</button><button type="button" class="btn primary" data-action="saveFactoryGps">Save GPS</button></div></div><div class="card"><h2>My account</h2><p class="muted">Change your own Firebase password securely. Management cannot see an employee's actual password.</p><button class="btn" data-action="changePassword">Change password</button></div></div>`);
}
async function audit(){
 if(!roleMgmt())return layout("Audit Trail","Restricted module",'<div class="card empty">Management access required.</div>');
 const rows=await getAll("auditLogs",[limit(300)]);rows.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
 return layout("Audit Trail","Operational record of important actions.",
 `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(x.date||"")}</td><td>${esc(x.actorName||x.actorId||"")}</td><td>${esc(x.action)}</td><td>${esc(x.entity)}</td><td>${esc(x.details)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">No audit records.</td></tr>'}</tbody></table></div>`);
}
async function writeAudit(action,entity,details){
 try{await addDoc(collection(db,"auditLogs"),{actorId:currentUser.uid,actorName:currentProfile.name||currentProfile.email||"",action,entity,details:String(details||"").slice(0,500),date:today(),createdAt:serverTimestamp()})}catch(e){console.warn("Audit write failed",e)}
}

function fieldsHtml(fields,data={}){
 return `<div class="form-grid">${fields.map(f=>{
  const [key,label,type,required,opts]=f,v=data[key]??"";
  if(type==="textarea")return `<label class="full">${esc(label)}<textarea name="${esc(key)}" ${required?"required":""}>${esc(v)}</textarea></label>`;
  if(type==="select")return `<label>${esc(label)}<select name="${esc(key)}" ${required?"required":""}>${opts.map(o=>`<option ${String(v)===o?"selected":""}>${esc(o)}</option>`).join("")}</select></label>`;
  return `<label>${esc(label)}<input name="${esc(key)}" type="${type}" value="${esc(v)}" ${required?"required":""}></label>`;
 }).join("")}</div>`;
}
async function genericModule(key){
 if(!roleMgmt())return layout(moduleDefs[key].title,"Restricted module",'<div class="card empty">Management access required.</div>');
 const def=moduleDefs[key],rows=await getAll(key,[limit(500)]);rows.sort((a,b)=>String(b.createdAt?.toDate?.()||b.date||"").localeCompare(String(a.createdAt?.toDate?.()||a.date||"")));
 const heads=def.fields.filter(f=>f[0]!=="notes").slice(0,5);
 return layout(def.title,def.desc,
 `<div class="toolbar"><button class="btn primary" data-action="genericAdd" data-id="${key}">+ Add record</button><button class="btn" data-action="genericExport" data-id="${key}">Export CSV</button><span class="muted">${rows.length} records</span></div>
 <div class="table-wrap"><table class="table"><thead><tr>${heads.map(f=>`<th>${esc(f[1])}</th>`).join("")}<th>Created</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr>${heads.map(f=>`<td>${esc(x[f[0]]??"")}</td>`).join("")}<td>${esc(x.date||"")}</td><td><button class="btn small" data-action="genericEdit" data-id="${key}|${x.id}">Edit</button></td></tr>`).join("")||`<tr><td colspan="${heads.length+2}" class="empty">No records yet.</td></tr>`}</tbody></table></div>`);
}

function modal(title,html,onSubmit){
 const r=$("#modalRoot");r.innerHTML=`<div class="modal-back"><div class="modal glass"><div class="section-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close>×</button></div>${html}</div></div>`;
 const f=r.querySelector("form");if(f&&onSubmit)f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector("button[type=submit]");if(b)b.disabled=true;try{await onSubmit(new FormData(f),r)}catch(err){alert(err.message||err)}finally{if(b)b.disabled=false}};
 r.querySelector("[data-close]").onclick=()=>r.innerHTML="";
}
function wireActions(){
 $$("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));
 $$("[data-action]").forEach(b=>b.onclick=async()=>{try{await actions(b.dataset.action,b.dataset.id)}catch(e){console.error("TVG action failed",e);toast(e?.message||"The requested action could not be completed.")}});
 const search=$("#employeeSearch");if(search)search.oninput=()=>{$$("#employeeTable tbody tr").forEach(r=>r.style.display=r.dataset.search?.includes(search.value.toLowerCase())?"":"none")};
 const rs=$("#reportScope");if(rs){const sync=()=>{const v=rs.value;$("#reportBranchWrap")?.classList.toggle("hidden",v!=="branch");$("#reportEmployeeWrap")?.classList.toggle("hidden",v!=="employee");};rs.addEventListener("change",sync);sync();}
 const f=$("#settingsForm");if(f)f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);await setDoc(doc(db,"settings","general"),{name:d.get("name"),radiusMeters:Number(d.get("radius")),shiftStart:d.get("shiftStart"),shiftEnd:d.get("shiftEnd"),graceMinutes:Number(d.get("grace")||0),weeklyOff:d.get("weeklyOff"),timeFormat:d.get("timeFormat")||"24",updatedAt:serverTimestamp()},{merge:true});appSettings={...appSettings,name:d.get("name"),timeFormat:d.get("timeFormat")||"24",shiftStart:d.get("shiftStart"),shiftEnd:d.get("shiftEnd"),graceMinutes:Number(d.get("grace")||0)};await writeAudit("UPDATE","settings","Factory/attendance settings updated");toast("Settings saved.");render("settings")};
 const ls=$("#leaveSearch"),lf=$("#leaveStatusFilter");if(ls||lf){const run=()=>{$$("#leaveArchive tr[data-search]").forEach(r=>{const okText=!ls||r.dataset.search.includes(ls.value.toLowerCase()),okStatus=!lf||!lf.value||r.dataset.status===lf.value;r.style.display=okText&&okStatus?"":"none"})};ls?.addEventListener("input",run);lf?.addEventListener("change",run)}
 const as=$("#appSearch"),af=$("#appStatusFilter");if(as||af){const run=()=>{$$("#appArchive tr[data-search]").forEach(r=>{const okText=!as||r.dataset.search.includes(as.value.toLowerCase()),okStatus=!af||!af.value||r.dataset.status===af.value;r.style.display=okText&&okStatus?"":"none"})};as?.addEventListener("input",run);af?.addEventListener("change",run)}
 $$('input[type=date],input[type=time],input[type=month]').forEach(i=>{i.addEventListener('focus',()=>{try{i.showPicker?.()}catch(_e){}});i.addEventListener('click',()=>{try{i.showPicker?.()}catch(_e){}})});
}

async function dashboardPeopleModal(mode){
 if(!roleMgmt())return;
 const [users,atts,locations]=await Promise.all([
   getAll("users",[limit(500)]),
   mode==="notInToday"?getAll("attendance",[where("date","==",today()),limit(500)]):Promise.resolve([]),
   getAll("locations",[limit(300)])
 ]);
 const lm=new Map(locations.map(l=>[l.id,l]));
 const present=new Set(atts.map(a=>a.employeeId));
 let source=mode==="notInToday"
   ? users.filter(u=>String(u.status||"Active").toLowerCase()!=="inactive" && !present.has(u.uid||u.id))
   : users.filter(u=>String(u.status||"").toLowerCase()==="inactive");
 const title=mode==="notInToday"?"Employees Not In Today":"Inactive Employees";
 const subtitle=mode==="notInToday"?`Active employees with no attendance record for ${today()}.`:`Employee profiles currently marked Inactive.`;
 const branches=[...new Map(source.map(u=>{const l=lm.get(u.locationId);const key=u.locationId||l?.id||l?.shopName||u.locationName||"unassigned";return [key,{id:key,name:l?.shopName||u.locationName||"Unassigned",city:l?.city||""}] })).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const branchOptions=branches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}${b.city?` — ${esc(b.city)}`:""}</option>`).join("");
 modal(title,`<div class="people-modal-head"><div><div class="muted">${esc(subtitle)}</div><div class="people-modal-count"><b id="peopleResultCount">${source.length}</b> matching employee${source.length===1?"":"s"}</div></div></div>
 <div class="toolbar people-filters"><input class="search" id="peopleSearch" placeholder="Search employee, ID, phone, branch…"><select class="search" id="peopleBranch"><option value="">All branches</option>${branchOptions}</select></div>
 <div id="peopleResults" class="people-results"></div>`,null);
 const renderRows=()=>{
   const q=($("#peopleSearch")?.value||"").trim().toLowerCase();
   const branch=$("#peopleBranch")?.value||"";
   const rows=source.filter(u=>{
     const l=lm.get(u.locationId); const key=u.locationId||l?.id||l?.shopName||u.locationName||"unassigned";
     const hay=`${u.name||""} ${u.employeeId||""} ${u.phone||""} ${l?.shopName||u.locationName||""} ${l?.city||""}`.toLowerCase();
     return (!q||hay.includes(q))&&(!branch||key===branch);
   });
   const box=$("#peopleResults"); if($("#peopleResultCount"))$("#peopleResultCount").textContent=rows.length;
   if(!box)return;
   box.innerHTML=rows.map(u=>{const l=lm.get(u.locationId);return `<div class="people-row"><div class="people-main"><div class="avatar">${esc((u.name||"E").slice(0,1).toUpperCase())}</div><div><b>${esc(u.name||"—")}</b><small>${esc(u.employeeId||"—")} · ${esc(u.designation||u.department||"Employee")}</small><small>${esc(l?.shopName||u.locationName||"Branch not assigned")}${l?.city?` · ${esc(l.city)}`:""}</small></div></div>${u.phone?`<a class="call-btn people-call" href="${phoneHref(u.phone)}" title="Call ${esc(u.name)}">☎</a>`:`<span class="muted">No phone</span>`}</div>`}).join("")||`<div class="empty">No employees match the selected filters.</div>`;
 };
 renderRows();
 $("#peopleSearch")?.addEventListener("input",renderRows);
 $("#peopleBranch")?.addEventListener("change",renderRows);
}

async function actions(a,id){
 if(a==="notInToday")return dashboardPeopleModal("notInToday");
 if(a==="inactiveEmployees")return dashboardPeopleModal("inactive");
 if(a==="profile")return profileModal();
 if(a==="passwordHelp")return toast("Firebase does not expose existing passwords. Use Reset to send the employee a secure password-reset email.");
 if(a==="passwordReset")return resetEmployeePassword(id);
 if(a==="openEmployeeReport")return openEmployeeReport(id);
 if(a==="generateManagementReport"){try{const r=await buildManagementReport();window._tvgGeneratedReport=r;$("#managementReportResult").innerHTML=renderManagementReport(r);toast(`Report generated · ${r.rows.length} employee${r.rows.length===1?"":"s"}.`)}catch(e){toast(e.message||"Report could not be generated.")}return;}
 if(a==="exportGeneratedReport"){if(!window._tvgGeneratedReport)return toast("Generate a report first.");const r=window._tvgGeneratedReport;const rows=r.rows.map(x=>({...x,period:`${r.from} to ${r.to}`}));if(id==="excel")exportExcelLike(`TVG-report-${r.scope}-${r.from}-${r.to}.xls`,rows);else downloadCsv(`TVG-report-${r.scope}-${r.from}-${r.to}.csv`,rows);return;}
 if(a==="runEmployeeReport"){const uid=$("#reportEmployee")?.value,month=$("#reportMonth")?.value;try{$("#employeeReportResult").innerHTML=`<div class="card empty">Loading report…</div>`;$("#employeeReportResult").innerHTML=await renderEmployeeReport(uid,month)}catch(e){$("#employeeReportResult").innerHTML=renderError(e)}return;}
 if(a==="exportEmployeeReport"){const [uid,month]=id.split("|");return exportEmployeeReport(uid,month);}
 if(a==="locationAdd")return locationModal();
 if(a==="locationEdit")return locationModal(id);
 if(a==="locationDelete")return deleteLocation(id);
 if(a==="saveFactoryGps")return saveFactoryGps();
 if(a==="employeeAdd")return employeeModal();
 if(a==="editEmployee")return employeeModal(id);
 if(a==="leaveAdd")return leaveAdd();
 if(a==="manualLeaveAdd")return manualLeaveAdd();
 if(a==="appAdd")return appAdd();
 if(a==="manualAppAdd")return manualAppAdd();
 if(a==="manualAttendanceAdd")return manualAttendanceModal();
 if(a==="manualAttendanceEdit")return manualAttendanceModal(id); 
 if(a==="activityAdd")return employeeActivityModal();
 if(a==="leaveReview")return review("leaves",id);
 if(a==="appReview")return review("applications",id);
 if(a==="leaveCancel")return cancelWorkflow("leaves",id);
 if(a==="appCancel")return cancelWorkflow("applications",id);
 if(a==="toggleNotifications"){const p=$("#notificationPanel");if(p){p.classList.toggle("hidden");renderNotificationPanel()}return;}
 if(a==="markAllNotifications")return markAllNotifications();
 if(a==="openNotification")return openNotification(id);
 if(a==="exportLeaves")return exportCollection("leaves");
 if(a==="exportApplications")return exportCollection("applications");
 if(a==="checkLocation")return checkLocation();
 if(a==="markAttendance")return markAttendance();
 if(a==="checkOut")return checkOut();
 if(a==="captureFactory")return captureFactory();
 if(a==="exportAttendance")return exportToday();
 if(a==="exportBusinessReport")return exportBusinessReport();
 if(a==="exportBranchReport")return exportBranchReport();
 if(a==="printPage")return printPage();
 if(a==="changePassword")return changePassword();
 if(a==="genericAdd")return genericModal(id);
 if(a==="genericEdit"){const [key,rid]=id.split("|");return genericModal(key,rid)}
 if(a==="genericExport")return exportCollection(id);
}
function profileModal(){
 const p=currentProfile;
 modal("My Profile",`<div class="profile-grid">${[["Name",p.name],["Employee ID",p.employeeId],["Email",p.email],["Department",p.department],["Designation",p.designation],["Role",roleLabel(p.role)]].map(x=>`<div class="profile-item"><small>${esc(x[0])}</small><b>${esc(x[1]||"—")}</b></div>`).join("")}</div><div class="actions" style="margin-top:15px"><button type="button" class="btn" id="profilePasswordBtn">Change password</button></div>`);$("#profilePasswordBtn").onclick=changePassword;
}
async function employeeModal(id){
 if(!roleMgmt())return;
 const existing=id?await getDoc(doc(db,"users",id)):null,x=existing?.exists()?existing.data():{};
 const locations=await getAll("locations",[limit(200)]),allUsers=await getAll("users",[limit(500)]);
 const html=`<form><div class="form-grid">
 <label>Employee ID / Number<input name="employeeId" value="${esc(x.employeeId||"")}" required></label>
 <label>Full name<input name="name" value="${esc(x.name||"")}" required></label>
 <label>Firebase Auth UID<input name="uid" value="${esc(x.uid||id||"")}" ${id?"readonly":"required"} placeholder="Paste Auth UID"></label>
 <label>Email<input name="email" type="email" value="${esc(x.email||"")}" required></label>
 <label>Phone / Mobile<input name="phone" value="${esc(x.phone||"")}"></label>
 <label>Department<input name="department" value="${esc(x.department||"")}" required></label>
 <label>Job / Designation<input name="designation" value="${esc(x.designation||"")}" required></label>
 <label>Employment Type<select name="employmentType"><option ${!x.employmentType||x.employmentType==="Permanent"?"selected":""}>Permanent</option><option ${x.employmentType==="Probation"?"selected":""}>Probation</option><option ${x.employmentType==="Contract"?"selected":""}>Contract</option><option ${x.employmentType==="Part-time"?"selected":""}>Part-time</option></select></label>
 <label>Joining Date<input name="joiningDate" type="date" value="${esc(x.joiningDate||"")}"></label>
 <label>Shop / City<select name="locationId"><option value="">Not assigned</option>${locations.map(l=>`<option value="${esc(l.id)}" ${String(x.locationId||"")===String(l.id)?"selected":""}>${esc(l.shopName||l.name)} — ${esc(l.city||"")}</option>`).join("")}</select></label>
 <label>Reporting To<select name="reportsToUid"><option value="">Not assigned</option>${allUsers.filter(u=>(u.uid||u.id)!==(x.uid||id)).map(u=>`<option value="${esc(u.uid||u.id)}" ${String(x.reportsToUid||"")===String(u.uid||u.id)?"selected":""}>${esc(u.name||"")} — ${esc(roleLabel(u.role))}</option>`).join("")}</select></label>
 <label>Role<select name="role"><option value="employee" ${x.role==="employee"||!x.role?"selected":""}>Employee</option>${isAdmin()?`<option value="manager" ${x.role==="manager"?"selected":""}>Operations Manager</option><option value="hr" ${x.role==="hr"?"selected":""}>HR</option><option value="admin" ${x.role==="admin"?"selected":""}>Administrator</option>`:""}</select></label>
 <label>Status<select name="status"><option ${String(x.status||"Active")==="Active"?"selected":""}>Active</option><option ${String(x.status||"")==="Inactive"?"selected":""}>Inactive</option></select></label>
 <label>Basic / Monthly Salary<input name="baseSalary" type="number" min="0" step="0.01" value="${esc(x.baseSalary??"")}"></label>
 <label>Salary Type<select name="salaryType"><option ${!x.salaryType||x.salaryType==="Monthly"?"selected":""}>Monthly</option><option ${x.salaryType==="Daily"?"selected":""}>Daily</option><option ${x.salaryType==="Hourly"?"selected":""}>Hourly</option></select></label>
 <label>Weekly Company Off<select name="weeklyOff">${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d=>`<option ${String(x.weeklyOff||appSettings.weeklyOff||"Sunday")===d?"selected":""}>${d}</option>`).join("")}</select></label>
 <label>Commission / Incentive<input name="commissionRate" type="number" min="0" step="0.01" value="${esc(x.commissionRate??"")}" placeholder="Optional rate %"></label>
 <label>Overtime Rate / Hour<input name="overtimeRate" type="number" min="0" step="0.01" value="${esc(x.overtimeRate??"")}"></label>
 <label>Monthly Allowances<input name="allowances" type="number" min="0" step="0.01" value="${esc(x.allowances??"")}"></label>
 <label>Manual Deductions<input name="manualDeductions" type="number" min="0" step="0.01" value="${esc(x.manualDeductions??"")}"></label>
 <label>Manual Commission / Incentive<input name="manualCommission" type="number" min="0" step="0.01" value="${esc(x.manualCommission??"")}"></label>
 <label class="full">Job Duties / Responsibilities<textarea name="duties" placeholder="Main duties, responsibilities and assigned work">${esc(x.duties||"")}</textarea></label>
 <label class="full">Company Assets Issued<textarea name="assetsIssued" placeholder="Mobile — TVG-001; iPad — TVG-014; Bike — BK-009; Laptop — LT-003">${esc(x.assetsIssued||"")}</textarea></label>
 <label class="full">HR / Employment Notes<textarea name="hrNotes" placeholder="Other HR notes, employment conditions, holiday notes">${esc(x.hrNotes||"")}</textarea></label>
 </div><button class="btn primary" type="submit">${id?"Save changes":"Create profile"}</button></form>`;
 modal(id?"Edit employee":"Create employee profile",html,async(d,r)=>{
   const uid=String(d.get("uid")).trim();if(!uid)throw new Error("Firebase Auth UID is required.");
   const role=d.get("role");if(!isAdmin()&&role!=="employee")throw new Error("Only an administrator can grant management roles.");
   const data={uid,employeeId:d.get("employeeId"),name:d.get("name"),email:String(d.get("email")).trim().toLowerCase(),phone:d.get("phone"),department:d.get("department"),designation:d.get("designation"),employmentType:d.get("employmentType"),joiningDate:d.get("joiningDate"),locationId:d.get("locationId")||"",reportsToUid:d.get("reportsToUid")||"",role,status:d.get("status"),baseSalary:Number(d.get("baseSalary")||0),salaryType:d.get("salaryType"),weeklyOff:d.get("weeklyOff"),commissionRate:Number(d.get("commissionRate")||0),overtimeRate:Number(d.get("overtimeRate")||0),allowances:Number(d.get("allowances")||0),manualDeductions:Number(d.get("manualDeductions")||0),manualCommission:Number(d.get("manualCommission")||0),duties:d.get("duties"),assetsIssued:d.get("assetsIssued"),hrNotes:d.get("hrNotes"),updatedAt:serverTimestamp()};
   if(!id)data.createdAt=serverTimestamp();
   await setDoc(doc(db,"users",uid),data,{merge:true});await writeAudit(id?"UPDATE":"CREATE","users",`${data.employeeId} ${data.name}`);r.innerHTML="";toast("Employee profile saved.");render("employees");
 });
}
async function openEmployeeReport(uid){render("employeeReport").then(()=>{const sel=$("#reportEmployee");if(sel)sel.value=uid;return actions("runEmployeeReport")}).catch(e=>console.error(e))}
async function resetEmployeePassword(id){
 const snap=await getDoc(doc(db,"users",id));if(!snap.exists())return toast("Employee profile not found.");const u=snap.data();if(!u.email)return toast("Employee has no email address in the profile.");
 if(!confirm(`Send a secure password reset email to ${u.name||"this employee"} at ${u.email}?`))return;
 await sendPasswordResetEmail(auth,u.email);await writeAudit("PASSWORD_RESET_EMAIL","users",u.uid||id);toast("Password reset email sent.");
}
async function locationModal(id){
 if(!roleMgmt())return;let x={};if(id){const s=await getDoc(doc(db,"locations",id));if(s.exists())x=s.data()}
 modal(id?"Edit Shop / Location":"Add Shop / Location",`<form><div class="form-grid"><label>Shop Name<input name="shopName" value="${esc(x.shopName||"")}" required></label><label>City<input name="city" value="${esc(x.city||"")}" required></label><label>Phone<input name="phone" value="${esc(x.phone||"")}"></label><label>Radius (meters)<input name="radiusMeters" type="number" min="20" value="${x.radiusMeters||150}" required></label><label>Latitude<input name="lat" type="number" step="any" value="${x.lat??""}" required></label><label>Longitude<input name="lng" type="number" step="any" value="${x.lng??""}" required></label><label class="full">Address<input name="address" value="${esc(x.address||"")}"></label></div><div class="actions"><button type="button" class="btn" data-action="captureModalLocation">Use current location</button><button class="btn primary" type="submit">Save shop</button></div></form>`,async(d,r)=>{const data={shopName:d.get("shopName"),city:d.get("city"),phone:d.get("phone"),radiusMeters:Number(d.get("radiusMeters")||150),lat:Number(d.get("lat")),lng:Number(d.get("lng")),address:d.get("address"),updatedAt:serverTimestamp()};if(id)await updateDoc(doc(db,"locations",id),data);else{data.createdAt=serverTimestamp();await addDoc(collection(db,"locations"),data)}await writeAudit(id?"UPDATE":"CREATE","locations",`${data.shopName} · ${data.city}`);r.innerHTML="";toast("Shop saved.");render("locations")});
 const b=$('#modalRoot [data-action="captureModalLocation"]');if(b)b.onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{$("#modalRoot [name=lat]").value=p.coords.latitude;$("#modalRoot [name=lng]").value=p.coords.longitude;toast("Location captured.")},e=>alert(e.message),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
async function deleteLocation(id){if(!isAdmin())return toast("Only an administrator can delete a shop.");const users=await getAll("users",[limit(500)]);if(users.some(u=>u.locationId===id))return toast("Reassign employees before deleting this shop.");if(!confirm("Delete this shop location?"))return;await deleteDoc(doc(db,"locations",id));await writeAudit("DELETE","locations",id);toast("Shop deleted.");render("locations")}
async function saveFactoryGps(){const lat=Number($("#factoryLat").value),lng=Number($("#factoryLng").value);if(!Number.isFinite(lat)||!Number.isFinite(lng))return toast("Enter valid latitude and longitude.");await setDoc(doc(db,"settings","general"),{lat,lng,updatedAt:serverTimestamp()},{merge:true});appSettings={...appSettings,lat,lng};await writeAudit("UPDATE","settings","Factory GPS updated");toast("Factory GPS saved.")}
async function getManagementUsers(){
  if(!roleMgmt())throw new Error("Management access required.");
  const users=await getAll("users",[limit(500)]);
  return users.filter(u=>String(u.status||"Active")!=="Inactive").sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
}
function employeeOptions(users,selected=""){
  return users.map(u=>`<option value="${esc(u.uid||u.id)}" ${String(selected)===String(u.uid||u.id)?"selected":""}>${esc(u.employeeId||"—")} · ${esc(u.name||"Unnamed")}</option>`).join("");
}
function calcWorkHours(checkIn,checkOut){
  if(!checkIn||!checkOut)return "";
  const a=toMinutes(checkIn),b=toMinutes(checkOut);if(a==null||b==null||b<a)return "";
  return ((b-a)/60).toFixed(2);
}
async function manualAttendanceModal(id){
  if(!roleMgmt())return;
  const users=await getManagementUsers();
  let x={};
  if(id){const s=await getDoc(doc(db,"attendance",id));if(!s.exists())return toast("Attendance record not found.");x={id:s.id,...s.data()}}
  const uid=x.employeeId||"";
  const html=`<form><div class="card"><p class="muted"><b>Management / Offline Entry:</b> Use this when the employee cannot use the app because the phone is unavailable, broken, left at home, or another operational reason has been physically verified.</p></div><div class="form-grid"><label>Employee<select name="employeeId" required ${id?"disabled":""}><option value="">Select employee</option>${employeeOptions(users,uid)}</select></label><label>Date<input name="date" type="date" value="${esc(x.date||today())}" required></label><label>Check-in<input name="checkIn" type="time" value="${esc(x.checkIn||"")}"></label><label>Check-out<input name="checkOut" type="time" value="${esc(x.checkOut||"")}"></label><label>Status<select name="status"><option ${String(x.status||"Present")==="Present"?"selected":""}>Present</option><option ${String(x.status||"")==="Absent"?"selected":""}>Absent</option><option ${String(x.status||"")==="Leave"?"selected":""}>Leave</option><option ${String(x.status||"")==="Half Day"?"selected":""}>Half Day</option></select></label><label>Entry reason<select name="manualReason"><option ${x.manualReason==="Phone unavailable"?"selected":""}>Phone unavailable</option><option ${x.manualReason==="Phone left at home"?"selected":""}>Phone left at home</option><option ${x.manualReason==="Phone damaged"?"selected":""}>Phone damaged</option><option ${x.manualReason==="App unavailable"?"selected":""}>App unavailable</option><option ${x.manualReason==="Management verified"?"selected":""}>Management verified</option><option>Other</option></select></label><label class="full">Management note<textarea name="note" placeholder="Physical verification / reason / any clarification">${esc(x.manualNote||"")}</textarea></label></div><button class="btn primary" type="submit">${id?"Save manual correction":"Save management attendance"}</button></form>`;
  modal(id?"Edit Management Attendance":"Management Attendance Entry",html,async(d,r)=>{
    const employeeId=id?x.employeeId:String(d.get("employeeId")||"");
    const u=users.find(v=>String(v.uid||v.id)===employeeId)||{};
    if(!employeeId||!u.name)throw new Error("Select a valid employee.");
    const date=String(d.get("date")||"");if(!date)throw new Error("Date is required.");
    const checkIn=String(d.get("checkIn")||""),checkOut=String(d.get("checkOut")||"");
    if(checkOut&&checkIn&&toMinutes(checkOut)<toMinutes(checkIn))throw new Error("Check-out cannot be earlier than check-in.");
    const workHours=calcWorkHours(checkIn,checkOut);
    const ref=id?doc(db,"attendance",id):doc(db,"attendance",`${employeeId}_${date}`);
    if(!id){const existing=await getDoc(ref);if(existing.exists())throw new Error("An attendance record already exists for this employee and date. Open it from the register/report and edit it instead of creating a duplicate.");}
    const data={employeeId,employeeName:u.name,employeeIdNumber:u.employeeId||"",date,checkIn,checkOut,workHours,status:d.get("status")||"Present",source:"Management Manual",manualReason:d.get("manualReason")||"Management verified",manualNote:d.get("note")||"",enteredBy:currentUser.uid,enteredByName:currentProfile.name||"Management",enteredAt:serverTimestamp(),updatedAt:serverTimestamp()};
    if(id)await updateDoc(ref,data);else{data.createdAt=serverTimestamp();await setDoc(ref,data)}
    await writeAudit(id?"MANUAL_ATTENDANCE_UPDATE":"MANUAL_ATTENDANCE_CREATE","attendance",`${u.employeeId||u.name} · ${date}`);
    try{await notifyEmployee(employeeId,"Attendance recorded by management",`Management recorded/updated your attendance for ${date}. Reason: ${data.manualReason}.`,{type:"attendance",entity:"attendance",entityId:ref.id});}catch(_e){}
    r.innerHTML="";toast(id?"Management attendance updated.":"Management attendance saved.");render("attendance");
  });
}
async function manualLeaveAdd(){
  if(!roleMgmt())return;const users=await getManagementUsers();
  modal("Management Leave Entry",`<form><div class="card"><p class="muted">Use this when an employee could not submit leave through the app. Enter the physically verified information on the employee's behalf.</p></div><div class="form-grid"><label>Employee<select name="employeeId" required><option value="">Select employee</option>${employeeOptions(users)}</select></label>${fieldsHtml([["type","Leave Type","select",true,["Casual","Annual","Sick","Emergency","Unpaid"]],["from","From","date",true],["to","To","date",true],["reason","Reason","textarea",true]])}<label class="full">Management note<textarea name="managementNote" placeholder="How was this request verified / received?"></textarea></label></div><button class="btn primary" type="submit">Save leave entry</button></form>`,async(d,r)=>{
    const uid=String(d.get("employeeId")||"");const u=users.find(v=>String(v.uid||v.id)===uid);if(!u)throw new Error("Select a valid employee.");
    const from=new Date(d.get("from")),to=new Date(d.get("to"));if(to<from)throw new Error("To date cannot be before From date.");const days=Math.floor((to-from)/86400000)+1;
    const ref=await addDoc(collection(db,"leaves"),{employeeId:uid,employeeName:u.name,type:d.get("type"),from:d.get("from"),to:d.get("to"),days,reason:d.get("reason"),status:"Pending",source:"Management Manual",enteredBy:currentUser.uid,enteredByName:currentProfile.name||"Management",managementNote:d.get("managementNote")||"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await writeAudit("MANUAL_LEAVE_CREATE","leaves",`${u.employeeId||u.name} · ${d.get("from")} to ${d.get("to")}`);try{await notifyEmployee(uid,"Leave entered by management",`Management recorded your ${d.get("type")} leave request for ${d.get("from")} to ${d.get("to")}.`,{type:"leave",entity:"leaves",entityId:ref.id});}catch(_e){}
    r.innerHTML="";toast("Leave entered on behalf of employee.");render("leaves");
  });
}
async function manualAppAdd(){
  if(!roleMgmt())return;const users=await getManagementUsers();
  modal("Management Application Entry",`<form><div class="card"><p class="muted">Use this when an employee cannot submit an application through the app. Management records the employee's request without pretending that the employee submitted it digitally.</p></div><div class="form-grid"><label>Employee<select name="employeeId" required><option value="">Select employee</option>${employeeOptions(users)}</select></label>${fieldsHtml([["category","Category","select",true,["General HR","Salary / Advance","Permission","Complaint","Document / Letter","Other"]],["subject","Subject","text",true],["details","Details","textarea",true],["date","Activity date","date",true]])}<label class="full">Management note<textarea name="managementNote" placeholder="How was this request received / verified?"></textarea></label></div><button class="btn primary" type="submit">Save application entry</button></form>`,async(d,r)=>{
    const uid=String(d.get("employeeId")||"");const u=users.find(v=>String(v.uid||v.id)===uid);if(!u)throw new Error("Select a valid employee.");
    const ref=await addDoc(collection(db,"applications"),{employeeId:uid,employeeName:u.name,category:d.get("category"),subject:d.get("subject"),details:d.get("details"),date:d.get("date")||today(),status:"Pending",source:"Management Manual",enteredBy:currentUser.uid,enteredByName:currentProfile.name||"Management",managementNote:d.get("managementNote")||"",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await writeAudit("MANUAL_APPLICATION_CREATE","applications",`${u.employeeId||u.name} · ${d.get("subject")}`);try{await notifyEmployee(uid,"Application entered by management",`Management recorded your application “${d.get("subject")||"Request"}”.`,{type:"application",entity:"applications",entityId:ref.id});}catch(_e){}
    r.innerHTML="";toast("Application entered on behalf of employee.");render("applications");
  });
}
async function employeeActivityModal(){
  if(!roleMgmt())return;const users=await getManagementUsers();
  modal("Employee Activity / Manual Note",`<form><div class="form-grid"><label>Employee<select name="employeeId" required><option value="">Select employee</option>${employeeOptions(users)}</select></label><label>Date<input name="date" type="date" value="${today()}" required></label><label>Time<input name="time" type="time" value="${timeNow()}" required></label><label>Activity Type<select name="type"><option>Phone unavailable</option><option>Manual attendance verification</option><option>Field activity</option><option>Leave information</option><option>Other</option></select></label><label class="full">Activity details<textarea name="details" required placeholder="What happened / what was physically verified?"></textarea></label></div><button class="btn primary" type="submit">Save activity</button></form>`,async(d,r)=>{
    const uid=String(d.get("employeeId")||"");const u=users.find(v=>String(v.uid||v.id)===uid);if(!u)throw new Error("Select a valid employee.");
    await addDoc(collection(db,"employeeActivities"),{employeeId:uid,employeeName:u.name,employeeIdNumber:u.employeeId||"",date:d.get("date"),time:d.get("time"),type:d.get("type"),details:d.get("details"),source:"Management Manual",enteredBy:currentUser.uid,enteredByName:currentProfile.name||"Management",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await writeAudit("MANUAL_ACTIVITY_CREATE","employeeActivities",`${u.employeeId||u.name} · ${d.get("type")}`);try{await notifyEmployee(uid,"Activity recorded by management",`Management added a record to your employee activity history for ${d.get("date")}.`,{type:"activity",entity:"employeeActivities"});}catch(_e){}
    r.innerHTML="";toast("Employee activity saved.");render("employeeReport");
  });
}

async function leaveAdd(){
 modal("New leave request",`<form>${fieldsHtml([["type","Leave Type","select",true,["Casual","Annual","Sick","Emergency","Unpaid"]],["from","From","date",true],["to","To","date",true],["reason","Reason","textarea",true]])}<button class="btn primary" type="submit">Submit leave</button></form>`,async(d,r)=>{
   const from=new Date(d.get("from")),to=new Date(d.get("to"));if(to<from)throw new Error("To date cannot be before From date.");
   const days=Math.floor((to-from)/86400000)+1;
   const ref=await addDoc(collection(db,"leaves"),{employeeId:currentUser.uid,employeeName:currentProfile.name,type:d.get("type"),from:d.get("from"),to:d.get("to"),days,reason:d.get("reason"),status:"Pending",createdAt:serverTimestamp()});
   await notifyManagement("New leave request",`${currentProfile.name} submitted ${d.get("type")} leave for ${d.get("from")} to ${d.get("to")} (${days} day${days===1?'':'s'}).`,{type:"leave",entity:"leaves",entityId:ref.id});
   await writeAudit("CREATE","leaves",`${d.get("type")} ${d.get("from")} to ${d.get("to")}`);r.innerHTML="";toast("Leave submitted. Management has been notified.");render("leaves");
 });
}
async function appAdd(){
 modal("Submit application",`<form>${fieldsHtml([["category","Category","select",true,["General HR","Salary / Advance","Permission","Complaint","Document / Letter","Other"]],["subject","Subject","text",true],["details","Details","textarea",true]])}<button class="btn primary" type="submit">Submit application</button></form>`,async(d,r)=>{
   const ref=await addDoc(collection(db,"applications"),{employeeId:currentUser.uid,employeeName:currentProfile.name,category:d.get("category"),subject:d.get("subject"),details:d.get("details"),date:today(),status:"Pending",createdAt:serverTimestamp()});
   await notifyManagement("New employee application",`${currentProfile.name} submitted “${d.get("subject")}” for ${today()}.`,{type:"application",entity:"applications",entityId:ref.id});
   await writeAudit("CREATE","applications",d.get("subject"));r.innerHTML="";toast("Application submitted. Management has been notified.");render("applications");
 });
}
async function review(type,id){
 if(!roleMgmt())return;
 const snap=await getDoc(doc(db,type,id));if(!snap.exists())return;
 const x=snap.data();
 modal("Review request",`<div class="card"><div class="kpi"><span>Employee</span><b>${esc(x.employeeName)}</b></div><div class="kpi"><span>Type</span><b>${esc(x.type||x.category)}</b></div><div class="kpi"><span>Date</span><b>${esc(x.from?`${x.from} → ${x.to}`:x.date||"—")}</b></div><p class="muted">${esc(x.reason||x.details||"No details provided.")}</p></div><form id="reviewForm"><label>Management note<textarea name="note" placeholder="Optional reason, instruction or clarification for the employee"></textarea></label><div class="actions" style="margin-top:14px"><button type="button" class="btn primary" data-review="Approved">Approve</button><button type="button" class="btn danger" data-review="Rejected">Reject</button></div></form>`);
 $$("#modalRoot [data-review]").forEach(b=>b.onclick=async()=>{try{
   const note=$("#modalRoot [name=note]")?.value?.trim()||"";
   if(b.dataset.review==="Rejected"&&!note&&!confirm("Reject without a management note?"))return;
   await updateDoc(doc(db,type,id),{status:b.dataset.review,reviewedBy:currentUser.uid,reviewedByName:currentProfile.name||"Management",reviewedAt:serverTimestamp(),reviewNote:note});
   await notifyEmployee(x.employeeId,`${type==="leaves"?"Leave":"Application"} ${b.dataset.review.toLowerCase()}`,`${type==="leaves"?`${x.type} leave (${x.from} to ${x.to})`:x.subject} was ${b.dataset.review.toLowerCase()} by ${currentProfile.name||"management"}.${note?` Note: ${note}`:""}`,{type:"workflow",entity:type,entityId:id});
   await writeAudit(b.dataset.review.toUpperCase(),type,id);$("#modalRoot").innerHTML="";toast(`Request ${b.dataset.review.toLowerCase()}. Employee notified.`);render(type);
 }catch(e){toast(e?.message||"The review action could not be completed.")}});
}
function distance(lat1,lon1,lat2,lon2){const R=6371000,p=Math.PI/180,dLat=(lat2-lat1)*p,dLon=(lon2-lon1)*p,a=Math.sin(dLat/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a))}
let lastLocation=null;
async function resolveAttendanceLocation(){
  // Simple functional architecture:
  // 1) Use assigned shop GPS when available.
  // 2) Otherwise use default factory GPS.
  // 3) If no GPS target has been configured yet, return a soft target so
  //    attendance can still be recorded instead of blocking the employee.
  let x={source:"factory",name:"TVG Factory",city:"",radiusMeters:Number(appSettings.radiusMeters||150)};
  try{
    if(currentProfile?.locationId){
      const ls=await getDoc(doc(db,"locations",currentProfile.locationId));
      if(ls.exists()){
        const d=ls.data();
        if(Number.isFinite(Number(d.lat))&&Number.isFinite(Number(d.lng))){
          return {...d,source:"shop",radiusMeters:Number(d.radiusMeters||150)};
        }
      }
    }
    const s=await getDoc(doc(db,"settings","general"));
    if(s.exists()){
      const d=s.data();
      if(Number.isFinite(Number(d.lat))&&Number.isFinite(Number(d.lng))){
        return {...d,source:"factory",radiusMeters:Number(d.radiusMeters||150),name:d.name||"TVG Factory"};
      }
      x={...x,...d,radiusMeters:Number(d.radiusMeters||150),name:d.name||"TVG Factory"};
    }
  }catch(e){
    // Attendance must not become unusable because an optional location document
    // is unavailable. The actual Firestore attendance write is handled separately.
    console.warn("Attendance location configuration read failed:",e);
  }
  return x;
}

function geoErrorMessage(e){
  if(!e)return "Unable to read your location.";
  if(e.code===1)return "Location permission was denied. Allow location access for this site and try again.";
  if(e.code===2)return "Your device could not determine a location. Turn on GPS/location services and try again.";
  if(e.code===3)return "Location request timed out. Move to an open area and try again.";
  return e.message||"Unable to read your location.";
}

async function getFreshLocation(){
  if(!navigator.geolocation)throw new Error("Geolocation is not supported by this browser/device.");
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{
    enableHighAccuracy:true,timeout:20000,maximumAge:0
  }));
}

async function checkLocation(){
  const el=$("#geoStatus");if(!el)return false;
  el.textContent="Getting high-accuracy location…";
  try{
    const target=await resolveAttendanceLocation();
    const p=await getFreshLocation();
    const lat=Number(p.coords.latitude),lng=Number(p.coords.longitude),accuracy=Number(p.coords.accuracy);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("The device returned an invalid GPS position.");
    lastLocation={latitude:lat,longitude:lng,accuracy};

    const hasTarget=Number.isFinite(Number(target?.lat))&&Number.isFinite(Number(target?.lng));
    if(!hasTarget){
      el.innerHTML='<span class="status-warn">✓ GPS location captured. Attendance zone is not configured yet, so check-in is allowed. Management can configure the shop/factory GPS later.</span>';
      return true;
    }

    const d=distance(lat,lng,Number(target.lat),Number(target.lng));
    const radius=Number(target.radiusMeters||150);
    const ok=d<=radius;
    const source=target.source==="shop"
      ?`${target.shopName||target.name||"assigned shop"}${target.city?" · "+target.city:""}`
      :"default factory";

    el.innerHTML=ok
      ?`<span class="status-good">✓ Inside attendance zone — ${Math.round(d)}m from ${esc(source)}. GPS accuracy ${Math.round(accuracy)}m. Radius ${Math.round(radius)}m.</span>`
      :`<span class="status-bad">✕ Outside attendance zone — ${Math.round(d)}m from ${esc(source)}. Allowed ${Math.round(radius)}m.</span>`;
    return ok;
  }catch(e){
    lastLocation=null;
    el.innerHTML=`<span class="status-bad">${esc(geoErrorMessage(e))}</span>`;
    return false;
  }
}

async function getTodayAttendance(){
 const rows=await getAll("attendance",[where("employeeId","==",currentUser.uid),where("date","==",today()),limit(20)]);
 return rows.sort((a,b)=>String(b.checkInAt?.toDate?.()||b.createdAt?.toDate?.()||b.checkIn||"").localeCompare(String(a.checkInAt?.toDate?.()||a.createdAt?.toDate?.()||a.checkIn||"")))[0]||null;
}
async function markAttendance(){
  if(!currentUser)return alert("Please sign in again.");
  const ok=await checkLocation();
  if(!ok)return;

  const date=today(),id=`${currentUser.uid}_${date}`,ref=doc(db,"attendance",id);
  try{
    const existing=await getDoc(ref);
    if(existing.exists())return alert(`Today's attendance is already recorded${existing.data().checkIn?` at ${formatTime(existing.data().checkIn)}`:""}.`);

    const target=await resolveAttendanceLocation();
    const lat=Number(lastLocation?.latitude),lng=Number(lastLocation?.longitude),accuracy=Number(lastLocation?.accuracy);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("Current GPS location is unavailable. Please check location again.");

    const hasTarget=Number.isFinite(Number(target?.lat))&&Number.isFinite(Number(target?.lng));
    const radius=Number(target?.radiusMeters||appSettings.radiusMeters||150);
    const d=hasTarget?distance(lat,lng,Number(target.lat),Number(target.lng)):null;

    if(hasTarget && d>radius){
      throw new Error(`You are outside the attendance zone (${Math.round(d)}m away; allowed ${Math.round(radius)}m).`);
    }

    const checkIn=timeNow();
    const shiftStart=appSettings.shiftStart||"09:00",grace=Number(appSettings.graceMinutes||0);
    const late=toMinutes(checkIn)!=null&&toMinutes(shiftStart)!=null&&toMinutes(checkIn)>toMinutes(shiftStart)+grace;

    await setDoc(ref,{
      employeeId:currentUser.uid,
      employeeName:currentProfile.name||currentProfile.email||"Employee",
      employeeIdNumber:currentProfile.employeeId||"",
      date,checkIn,checkInAt:serverTimestamp(),
      lat,lng,accuracy,
      distanceMeters:d==null?null:Math.round(d),
      geofenceVerified:hasTarget,
      status:"Present",
      punctuality:late?"Late":"On Time",
      locationId:currentProfile.locationId||"",
      locationName:target?.shopName||target?.name||"TVG Factory",
      locationCity:target?.city||"",
      geofenceRadiusMeters:radius,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });

    await writeAudit("CHECK_IN","attendance",`${date} · ${currentProfile.employeeId||currentUser.uid}`);
    toast("Attendance marked successfully.");
    await render("attendance");
  }catch(e){
    console.error("Attendance check-in failed:",e);
    throw new Error(e?.message||"Attendance could not be saved. Please try again.");
  }
}

async function checkOut(){
  if(!currentUser)return alert("Please sign in again.");
  const ok=await checkLocation();
  if(!ok)return;

  const existing=await getTodayAttendance();
  if(!existing)return alert("No check-in record found for today. Please mark check-in first.");

  const ref=doc(db,"attendance",existing.id);
  try{
    const snap=await getDoc(ref);
    if(!snap.exists())return alert("Today's attendance record could not be found. Refresh and try again.");
    const x=snap.data();
    if(x.checkOut)return alert(`Today's check-out is already recorded at ${formatTime(x.checkOut)}.`);

    const now=timeNow(),start=toMinutes(x.checkIn),end=toMinutes(now);
    const hours=start==null||end==null?"":((Math.max(0,end-start))/60).toFixed(2);

    await updateDoc(ref,{
      checkOut:now,
      checkOutAt:serverTimestamp(),
      checkoutLat:Number(lastLocation.latitude),
      checkoutLng:Number(lastLocation.longitude),
      checkoutAccuracy:Number(lastLocation.accuracy),
      workHours:hours,
      updatedAt:serverTimestamp()
    });

    await writeAudit("CHECK_OUT","attendance",`${today()} · ${currentProfile.employeeId||currentUser.uid}`);
    toast(`Check-out recorded${hours?` · ${hours} hours`:""}.`);
    await render("attendance");
  }catch(e){
    console.error("Attendance check-out failed:",e);
    throw new Error(e?.message||"Check-out could not be saved. Please try again.");
  }
}

function toMinutes(s){if(!s)return null;const [h,m]=String(s).split(":").map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null}
async function captureFactory(){
 if(!navigator.geolocation)return alert("Geolocation is not supported.");
 navigator.geolocation.getCurrentPosition(p=>{$("#factoryLat").value=p.coords.latitude;$("#factoryLng").value=p.coords.longitude;toast("Factory coordinates captured.");},e=>alert("Location permission failed: "+geoErrorMessage(e)),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
}
async function changePassword(){
 modal("Change password",`<form><label>Current password<input name="old" type="password" required autocomplete="current-password"></label><label>New password<input name="new" type="password" minlength="8" required autocomplete="new-password"></label><label>Confirm new password<input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn primary" type="submit">Change password</button></form>`,async(d,r)=>{
   if(d.get("new")!==d.get("confirm"))throw new Error("New passwords do not match.");
   const cred=EmailAuthProvider.credential(currentUser.email,d.get("old"));await reauthenticateWithCredential(currentUser,cred);await updatePassword(currentUser,d.get("new"));
   await writeAudit("PASSWORD_CHANGE","users",currentUser.uid);r.innerHTML="";toast("Password changed successfully.");
 });
}
function genericModal(key,id){
 const def=moduleDefs[key];if(!def)return;let existing=null;
 const open=async()=>{
  if(id){const s=await getDoc(doc(db,key,id));existing=s.exists()?s.data():{}}
  const x=existing||{};
  modal(id?`Edit ${def.title}`:`Add ${def.title}`,`<form>${fieldsHtml(def.fields,x)}<button class="btn primary" type="submit">${id?"Save changes":"Save record"}</button></form>`,async(d,r)=>{
    const data={};def.fields.forEach(f=>{data[f[0]]=d.get(f[0])});data.updatedAt=serverTimestamp();if(!id)data.createdAt=serverTimestamp();
    if(key==="payroll"&&!data.net)data.net=String((Number(data.basic)||0)+(Number(data.allowances)||0)-(Number(data.deductions)||0));
    if(id)await updateDoc(doc(db,key,id),data);else await addDoc(collection(db,key),data);
    await writeAudit(id?"UPDATE":"CREATE",key,id||data[def.fields[0][0]]||"record");r.innerHTML="";toast("Record saved.");render(key);
  });
 };open();
}
async function exportEmployeeReport(uid,month){const r=await buildEmployeeReport(uid,month);const rows=r.ar.map(a=>({...a,employeeId:r.u.employeeId,employeeName:r.u.name,branch:r.u.locationName||"",source:a.source||"App / GPS"}));downloadCsv(`TVG-${r.u.employeeId||r.u.name}-${month}.csv`,rows,["employeeId","employeeName","date","checkIn","checkOut","workHours","status","source","distanceMeters"]);toast("Employee CSV exported.")}
function printPage(){window.print()}
function exportExcelLike(name,rows){const keys=Array.from(new Set(rows.flatMap(r=>Object.keys(r))));const html=`<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${keys.map(k=>`<th>${esc(k)}</th>`).join("")}</tr>${rows.map(r=>`<tr>${keys.map(k=>`<td>${esc(r[k]??"")}</td>`).join("")}</tr>`).join("")}</table></body></html>`;const blob=new Blob([html],{type:"application/vnd.ms-excel"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Excel-compatible file exported.")}
async function exportBusinessReport(){const [users,locations,atts]=await Promise.all([getAll("users",[limit(500)]),getAll("locations",[limit(200)]),getAll("attendance",[where("date","==",today()),limit(500)])]);const lm=new Map(locations.map(l=>[l.id,l]));const rows=users.filter(u=>String(u.status||"Active")!=="Inactive").map(u=>{const a=atts.find(x=>x.employeeId===(u.uid||u.id)),l=lm.get(u.locationId);return {employeeId:u.employeeId||"",name:u.name||"",phone:u.phone||"",department:u.department||"",designation:u.designation||"",branch:l?.shopName||u.locationName||"",city:l?.city||"",status:u.status||"Active",checkIn:a?.checkIn||"",checkOut:a?.checkOut||"",workHours:a?.workHours||"",salary:u.baseSalary||0}});downloadCsv(`TVG-business-${today()}.csv`,rows);exportExcelLike(`TVG-business-${today()}.xls`,rows)}
async function exportBranchReport(){const [users,locations,atts]=await Promise.all([getAll("users",[limit(500)]),getAll("locations",[limit(200)]),getAll("attendance",[where("date","==",today()),limit(500)])]);const rows=locations.map(l=>{const us=users.filter(u=>String(u.status||"Active")!=="Inactive"&&u.locationId===l.id),ids=new Set(us.map(u=>u.uid||u.id)),pa=atts.filter(a=>ids.has(a.employeeId));return {branch:l.shopName||l.name||"",city:l.city||"",employees:us.length,present:pa.length,onDuty:pa.filter(a=>!a.checkOut).length,coverage:us.length?Math.round(pa.length/us.length*100)+"%":"0%"}});downloadCsv(`TVG-branch-${today()}.csv`,rows);exportExcelLike(`TVG-branch-${today()}.xls`,rows)}
async function exportToday(){
 const rows=await getAll("attendance",[where("date","==",today()),limit(500)]);if(!rows.length)return alert("No attendance records today.");
 downloadCsv(`TVG-attendance-${today()}.csv`,rows,["employeeName","date","checkIn","checkOut","workHours","lat","lng","accuracy","distanceMeters","status"]);
}
async function exportCollection(key){
 const rows=await getAll(key,[limit(500)]);if(!rows.length)return alert("No records to export.");
 downloadCsv(`TVG-${key}-${today()}.csv`,rows);
}
function downloadCsv(name,rows,preferred=[]){
 const keys=preferred.length?preferred:Array.from(new Set(rows.flatMap(r=>Object.keys(r).filter(k=>!["id","createdAt","updatedAt"].includes(k))))).slice(0,30);
 const csv=[keys.join(","),...rows.map(r=>keys.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
init();
