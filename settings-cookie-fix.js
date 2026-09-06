function hasDiscordSessionCookie(){return document.cookie.split(';').some(part=>part.trim().startsWith('pcls_discord_session='));}

function showMessage(text, success){
  const box=document.getElementById('statusMessage');
  if(!box)return;
  box.textContent=text;
  box.className=`alert-box ${success?'alert-success':'alert-error'}`;
  box.style.display='block';
  window.clearTimeout(window.__pclsSettingsMessageTimer);
  window.__pclsSettingsMessageTimer=window.setTimeout(()=>{box.style.display='none';},5000);
}

function bootCookieSettings(){
  const form=document.getElementById('profileForm');
  if(!form||form.dataset.cookieFixV2Installed)return;
  form.dataset.cookieFixV2Installed='true';

  // Prevent the legacy Firebase submit handler synchronously. The API call
  // must happen through the Discord-cookie backend because cookie sessions
  // are not authorized by Firestore client rules.
  form.addEventListener('submit',event=>{
    if(!hasDiscordSessionCookie())return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const name=String(document.getElementById('displayName')?.value||'').trim();
    if(!name){showMessage('Numele nu poate fi gol.',false);return;}

    void (async()=>{
      try{
        const save=await fetch('/api/update-profile',{
          method:'POST',
          credentials:'same-origin',
          cache:'no-store',
          headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({name})
        });
        const out=await save.json().catch(()=>({}));
        if(!save.ok||!out.ok)throw new Error(out.error||'Nu s-a putut salva numele.');
        const input=document.getElementById('displayName');
        if(input)input.value=out.name||name;
        window.__PCLSSettingsName=out.name||name;
        showMessage('Numele a fost salvat cu succes!',true);
      }catch(error){
        console.error('Cookie profile update:',error);
        showMessage(error?.message||'Nu s-a putut salva numele.',false);
      }
    })();
  },true);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootCookieSettings,{once:true});
else bootCookieSettings();
