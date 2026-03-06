/**
 * Risk-to-color mapping utilities for CascadeGuard
 */

export const RISK_COLORS = {
  critical: '#ff1744',
  high: '#ff6d00',
  medium: '#ffab00',
  low: '#00e676',
  operational: '#00e676',
  warning: '#ffab00',
  degraded: '#ff6d00',
  failed: '#ff1744',
};

export const STATUS_COLORS = {
  operational: '#00e676',
  warning: '#ffab00',
  degraded: '#ff6d00',
  critical: '#ff1744',
  failed: '#ff1744',
};

/**
 * Get color based on failure probability (0-1)
 */
export function getRiskColor(failureProb) {
  if (failureProb >= 0.8) return RISK_COLORS.critical;
  if (failureProb >= 0.5) return RISK_COLORS.high;
  if (failureProb >= 0.3) return RISK_COLORS.medium;
  return RISK_COLORS.low;
}

/**
 * Get a CSS gradient stop color based on health score
 */
export function getHealthGradient(healthScore) {
  const r = Math.round(255 * (1 - healthScore));
  const g = Math.round(200 * healthScore);
  return `rgb(${r}, ${g}, 40)`;
}

/**
 * Get glow shadow color for nodes
 */
export function getGlowColor(failureProb) {
  const color = getRiskColor(failureProb);
  return `${color}80`;
}

/**
 * Machine type icons (emoji-based for simplicity)
 */
export const MACHINE_ICONS = {
  'Air Compressor': '🔧',
  'Pneumatic Press': '⚙️',
  'CNC Machine': '🏭',
  'Assembly Robot': '🤖',
  'Packaging Conveyor': '📦',
};

/**
 * Format percentage display
 */
export function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format hours display
 */
export function formatHours(hours) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)} hrs`;
}
