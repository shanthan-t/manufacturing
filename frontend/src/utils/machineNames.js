/**
 * Machine naming utilities — maps internal IDs to human-readable display names.
 * Internal IDs (e.g. CMP-A1) stay in system logic; display names appear in the UI.
 */

const TYPE_NAMES = {
    CMP: 'Air Compressor',
    PRS: 'Hydraulic Press',
    CNC: 'CNC Machine',
    ROB: 'Assembly Robot',
    CNV: 'Packaging Conveyor',
};

const LINE_LABELS = {
    A: 'Line A',
    B: 'Line B',
    C: 'Line C',
    D: 'Line D',
};

/**
 * Get human-readable display name from a machine ID.
 * "CMP-A1" → "Air Compressor"
 */
export function getMachineName(machineId) {
    if (!machineId) return '';
    const prefix = machineId.split('-')[0];
    return TYPE_NAMES[prefix] || machineId;
}

/**
 * Get production line label from machine ID.
 * "CMP-A1" → "Line A"
 */
export function getLineLabel(machineId) {
    if (!machineId) return '';
    const suffix = machineId.split('-')[1];
    if (!suffix) return '';
    const letter = suffix.charAt(0);
    return LINE_LABELS[letter] || `Line ${letter}`;
}

/**
 * Full display label: "Air Compressor (Line A)"
 */
export function getMachineDisplayLabel(machineId) {
    const name = getMachineName(machineId);
    const line = getLineLabel(machineId);
    if (line) return `${name} (${line})`;
    return name;
}

/**
 * Short label for compact views: "Air Compressor A1"
 */
export function getMachineShortLabel(machineId) {
    if (!machineId) return '';
    const prefix = machineId.split('-')[0];
    const suffix = machineId.split('-')[1] || '';
    const name = TYPE_NAMES[prefix] || prefix;
    return `${name} ${suffix}`;
}

export { TYPE_NAMES, LINE_LABELS };
