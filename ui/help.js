const dialog=document.getElementById('help-dialog');
const opener=document.getElementById('open-help');
let returnFocus;
opener.addEventListener('click',()=>{
 returnFocus=document.activeElement;
 if(!dialog.open)dialog.showModal();
});
for(const button of dialog.querySelectorAll('[data-help-topic]')){
 button.addEventListener('click',()=>{
  for(const topic of dialog.querySelectorAll('[data-help-topic]'))topic.setAttribute('aria-pressed',String(topic===button));
  for(const screen of dialog.querySelectorAll('[data-help-screen]'))screen.hidden=screen.id!==`help-${button.dataset.helpTopic}`;
  dialog.querySelector(`#help-${button.dataset.helpTopic} h3`).focus();
 });
}
dialog.addEventListener('close',()=>{
 if(returnFocus?.isConnected&&!returnFocus.disabled)returnFocus.focus({preventScroll:true});
});
// Keep Tab within help even when a topic heading has programmatic focus.
dialog.addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const controls=[...dialog.querySelectorAll('button:not(:disabled)')];
 const index=controls.indexOf(document.activeElement);
 if(index<0||(!event.shiftKey&&index===controls.length-1)||(event.shiftKey&&index===0)){
  event.preventDefault();controls[event.shiftKey?controls.length-1:0]?.focus();
 }
});
