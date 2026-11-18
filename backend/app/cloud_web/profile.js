// Decode locally, downscale and re-encode: strip metadata before sending a portrait.
window.smartiProfilePhoto='';
const profileText=(nb,en)=>window.smartiAuthLanguage?.text(nb,en)??nb;
let photoMessage;
function showPhotoMessage(copy) {
 photoMessage=copy;
 const status=document.getElementById('photo-status');
 if(status)status.textContent=copy?profileText(...copy):'';
}
document.addEventListener('smarti-auth-language',()=>showPhotoMessage(photoMessage));
for(const id of ['photo-camera','photo-library'])document.getElementById(id)?.addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 if(file.size>20000000){
  showPhotoMessage(['Velg et bilde under 20 MB.', 'Choose a photo smaller than 20 MB.']);
  e.target.value='';
  return;
 }
 showPhotoMessage(['Klargjør bildet…','Preparing the photo…']);
 let url;
 try{
  url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=400;
  const side=Math.min(img.naturalWidth,img.naturalHeight);canvas.getContext('2d').drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,400,400);
  window.smartiProfilePhoto=canvas.toDataURL('image/jpeg',.82);
  const preview=document.getElementById('photo-preview');preview.src=window.smartiProfilePhoto;preview.hidden=false;
  document.getElementById('photo-remove').hidden=false;showPhotoMessage(['Profilbildet er klart.','Your profile photo is ready.']);
 }catch{showPhotoMessage(['Bildet kunne ikke leses. Velg et annet bilde eller fortsett uten.','Could not read the photo. Choose another one or continue without it.']);}
 finally{if(url)URL.revokeObjectURL(url);e.target.value='';}
});
document.getElementById('photo-remove')?.addEventListener('click',()=>{window.smartiProfilePhoto='';document.getElementById('photo-preview').hidden=true;document.getElementById('photo-remove').hidden=true;showPhotoMessage();});
