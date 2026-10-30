const esc = v => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={RETRY:'Consultar / reanudar pago',RESELECT:'Permitir reselección en FuelFlow',CANCEL:'Cancelar y liberar de forma controlada',ESCALATE:'Escalar pago'};
export const paymentRecoveryButton = operationId => `<button type="button" data-payment-recovery="${esc(operationId)}">Consultar pago / asistir</button>`;
export function bindPaymentRecovery({api,onError}) {
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-payment-recovery]');if(!button)return;
  try{
   let dialog=document.querySelector('#payment-recovery-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='payment-recovery-dialog';document.body.append(dialog);}
   const id=button.dataset.paymentRecovery;
   const render=detail=>{
    dialog.innerHTML=`<h2>Asistencia de pago</h2><p>Operación ${esc(id)} · Terminal ${esc(detail.terminalId)} · Surtidor ${esc(detail.pumpId)}</p><p>Método ${esc(detail.payment?.method)} · Estado financiero ${esc(detail.payment?.status)} · Importe ${esc(detail.payment?.amount)} · Orden ${esc(detail.order?.status)}</p><p>Despachado ${esc(detail.authorization?.dispensedGallons)} galones</p><p>El estado financiero es confirmado exclusivamente por Backend/proveedor.</p>${detail.incidents.map(i=>`<p>${esc(i.summary)} · ${esc(i.status)}</p>`).join('')}<label>Observación<textarea maxlength="500"></textarea></label><p role="status">${esc(detail.message||'')}</p>${detail.allowedActions.map(action=>`<button type="button" data-recovery-action="${action}">${labels[action]}</button>`).join('')}<form method="dialog"><button>Cerrar</button></form>`;
    dialog.querySelectorAll('[data-recovery-action]').forEach(action=>action.onclick=async()=>{
     action.disabled=true;
     try{render(await api('/control/supervisor/payments/'+id+'/actions',{method:'POST',body:JSON.stringify({action:action.dataset.recoveryAction,observation:dialog.querySelector('textarea').value})}));}
     catch(error){dialog.querySelector('[role=status]').textContent=error.message;action.disabled=false;}
    });
   };
   render(await api('/control/supervisor/payments/'+id));dialog.showModal();
  }catch(error){onError(error);}
 });
}
