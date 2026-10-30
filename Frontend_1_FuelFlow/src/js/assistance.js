export const assistanceReasons = ['AYUDA_GENERAL', 'ERROR_PAGO', 'PROBLEMA_TERMINAL', 'PROBLEMA_DESPACHO', 'COMPROBANTE_IMPRESION', 'OTRO'];
export const assistanceLabels = {
  PENDIENTE: 'Solicitud pendiente. Esperando a un Supervisor.',
  EN_ATENCION: 'Un Supervisor está atendiendo tu solicitud.',
  RESUELTA: 'El Supervisor registró la solicitud como resuelta.',
  ESCALADA: 'La solicitud fue escalada para su revisión.',
  CANCELADA_POR_CLIENTE: 'Solicitud cancelada por el cliente.',
};

// The stable creation payload survives reloads and ambiguous network responses.
export function createAssistanceClient({ request, storage = globalThis.sessionStorage, uuid = () => crypto.randomUUID() }) {
  const key = 'fuelflow:assistance:v2';
  let inFlight;
  const current = () => JSON.parse(storage.getItem(key) || 'null');
  const save = value => { storage.setItem(key, JSON.stringify(value)); return value; };
  return {
    current,
    submit(context) {
      if (inFlight) return inFlight;
      const pending = current();
      if (pending?.id) return this.refresh();
      const payload = pending?.payload || { requestId: uuid(), ...context };
      save({ payload });
      inFlight = request('/terminal/assistance', { method: 'POST', body: payload })
        .then(row => { save({ ...row, payload }); return row; }).finally(() => { inFlight = null; });
      return inFlight;
    },
    async refresh() {
      const pending = current();
      if (!pending?.id) return pending?.payload ? this.submit(pending.payload) : null;
      const row = await request('/terminal/assistance/' + pending.id);
      save({ ...row, payload: pending.payload });
      return row;
    },
    async cancel() {
      const pending = current();
      if (!pending?.id) throw Error('Confirma primero el estado de la solicitud.');
      const row = await request('/terminal/assistance/' + pending.id + '/cancel', { method: 'POST', body: {} });
      save({ ...row, payload: pending.payload });
      return row;
    },
    clearCompleted() {
      if (['RESUELTA', 'ESCALADA', 'CANCELADA_POR_CLIENTE'].includes(current()?.status)) storage.removeItem(key);
    },
  };
}
