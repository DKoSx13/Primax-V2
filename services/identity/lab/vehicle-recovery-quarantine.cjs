// Sticky experimental quarantine on a dedicated NEW lab control volume.
// No reset, TTL, unlock-stale, automatic recovery, or public Backend integration.
const fs = require('node:fs'), path = require('node:path');
const { RecoveryError } = require('./vehicle-recovery-inspector.cjs');
class LaboratoryQuarantine {
  #directory; #datasetId;
  constructor({ synthetic, directory, datasetId }) {
    if (synthetic !== true || !/^a4-[a-f0-9]{24}$/.test(datasetId) || !path.isAbsolute(directory) ||
        !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new RecoveryError('PRIVATE_LAB_REQUIRED');
    this.#directory = directory; this.#datasetId = datasetId;
    const identity = path.join(directory, 'dataset.json');
    // The fixture controller creates this immutable identity before any gate opens.
    if (JSON.parse(fs.readFileSync(identity, 'utf8')).datasetId !== datasetId) throw new RecoveryError('CONTROL_IDENTITY_MISMATCH');
  }
  state() {
    try { if (JSON.parse(fs.readFileSync(path.join(this.#directory, 'dataset.json'), 'utf8')).datasetId !== this.#datasetId)
      return { status: 'QUARANTINED', reason: 'CONTROL_IDENTITY_MISMATCH' }; }
    catch { return { status: 'QUARANTINED', reason: 'CONTROL_UNREADABLE' }; }
    try {
      const value = JSON.parse(fs.readFileSync(path.join(this.#directory, 'quarantine.json'), 'utf8'));
      return { status: 'QUARANTINED', reason: value.datasetId === this.#datasetId ? value.reason : 'CONTROL_IDENTITY_MISMATCH' };
    } catch (error) { return { status: error.code === 'ENOENT' ? 'UNASSESSED' : 'QUARANTINED', reason: error.code === 'ENOENT' ? undefined : 'CONTROL_UNREADABLE' }; }
  }
  #latch(reason) {
    let fd;
    try {
      fd = fs.openSync(path.join(this.#directory, 'quarantine.json'), 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ synthetic: true, datasetId: this.#datasetId, reason }) + '\n'); fs.fsyncSync(fd);
      const dir = fs.openSync(this.#directory, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    } catch (error) { if (error.code !== 'EEXIST') throw new RecoveryError('CONTROL_UNAVAILABLE'); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  async #locked(work) {
    let fd;
    try { fd = fs.openSync(path.join(this.#directory, 'admission.lock'), 'wx', 0o600); }
    catch { throw new RecoveryError('RECOVERY_REQUIRED'); } // Busy or stale: no automatic lock stealing.
    try { return await work(); }
    finally { fs.closeSync(fd); fs.unlinkSync(path.join(this.#directory, 'admission.lock')); }
  }
  async assess(inspector) {
    return this.#locked(async () => {
      const report = await inspector.inspect();
      if (report.classification !== 'CONSISTENT') this.#latch(report.classification);
      return { report, admission: this.state().status === 'QUARANTINED' ? 'QUARANTINED' : 'ELIGIBLE_FOR_THIS_LAB_SNAPSHOT' };
    });
  }
  async execute({ authorize, inspector, submit }) {
    await authorize(); // Trusted synthetic policy; never authenticate with a receipt.
    return this.#locked(async () => {
      if (this.state().status === 'QUARANTINED') throw new RecoveryError('RECOVERY_REQUIRED');
      const report = await inspector.inspect();
      if (report.classification !== 'CONSISTENT') { this.#latch(report.classification); throw new RecoveryError('RECOVERY_REQUIRED'); }
      // The lock covers participating assess/execute calls through completion.
      // It cannot fence unrelated SQL writers, v1, public Backend, or a second control volume.
      return submit();
    });
  }
}
module.exports = { LaboratoryQuarantine };
