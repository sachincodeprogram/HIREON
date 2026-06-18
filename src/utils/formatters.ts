export const formatCurrency = (amount: number) =>
  `₹${amount.toLocaleString('en-IN')}`;

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export const formatDateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

export const formatDistance = (km: number) =>
  km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;

export const truncateAddress = (address: string, maxLen = 40) =>
  address.length > maxLen ? address.slice(0, maxLen) + '…' : address;
