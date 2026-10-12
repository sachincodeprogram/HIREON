import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../../constants/api';
import { TranslationKey } from '../../i18n';
import { SupportCategory, SupportStatus, UserRole } from '../../types';

export interface TopicOption {
  key:   SupportCategory;
  label: TranslationKey;
  icon:  string;
}

// Rider aur customer ke topics alag — har ek ko wahi dikhe jo uske kaam ka hai.
export const topicsFor = (role: UserRole | undefined): TopicOption[] => role === 'rider'
  ? [
    { key: 'order_issue', label: 'support.cat.order_issue',     icon: '📦' },
    { key: 'payment',     label: 'support.cat.payment_rider',   icon: '💰' },
    { key: 'wallet',      label: 'support.cat.wallet',          icon: '👛' },
    { key: 'behaviour',   label: 'support.cat.behaviour_rider', icon: '🙋' },
    { key: 'account',     label: 'support.cat.account',         icon: '👤' },
    { key: 'app_bug',     label: 'support.cat.app_bug',         icon: '🛠️' },
    { key: 'other',       label: 'support.cat.other',           icon: '💬' },
  ]
  : [
    { key: 'order_issue', label: 'support.cat.order_issue',        icon: '📦' },
    { key: 'payment',     label: 'support.cat.payment_customer',   icon: '💳' },
    { key: 'behaviour',   label: 'support.cat.behaviour_customer', icon: '🙋' },
    { key: 'account',     label: 'support.cat.account',            icon: '👤' },
    { key: 'app_bug',     label: 'support.cat.app_bug',            icon: '🛠️' },
    { key: 'other',       label: 'support.cat.other',              icon: '💬' },
  ];

export const topicFor = (role: UserRole | undefined, key: SupportCategory): TopicOption =>
  topicsFor(role).find(o => o.key === key)
  // Purana/dusre role ka topic (jaise customer ka 'wallet') — generic label
  ?? { key, label: key === 'wallet' ? 'support.cat.wallet' : 'support.cat.other', icon: '💬' };

// Help center ke aam sawaal — har role ke liye alag
export const faqsFor = (role: UserRole | undefined): { q: TranslationKey; a: TranslationKey }[] =>
  (role === 'rider' ? ['r1', 'r2', 'r3', 'r4', 'r5'] : ['c1', 'c2', 'c3', 'c4', 'c5']).map(k => ({
    q: `support.faq.${k}.q` as TranslationKey,
    a: `support.faq.${k}.a` as TranslationKey,
  }));

export const STATUS_STYLE: Record<SupportStatus, { fg: string; bg: string; label: TranslationKey }> = {
  open:        { fg: COLORS.warning,   bg: COLORS.warningBg, label: 'support.status.open' },
  in_progress: { fg: COLORS.secondary, bg: COLORS.secondaryBg, label: 'support.status.in_progress' },
  resolved:    { fg: COLORS.success,   bg: COLORS.successBg, label: 'support.status.resolved' },
  closed:      { fg: COLORS.textMuted, bg: COLORS.surface2,  label: 'support.status.closed' },
};

// Backend ke system messages English me aate hain — jaane-pehchane wale
// user ki bhasha me dikhao.
export const systemText = (text: string, t: (k: TranslationKey, p?: Record<string, string | number>) => string) => {
  const created = /^Ticket (\S+) created$/.exec(text);
  if (created) return t('support.created', { no: created[1] });
  switch (text) {
    case 'Ticket reopened':               return t('support.reopened');
    case 'Our team is looking into this': return t('support.inProgress');
    case 'Ticket marked as resolved':     return t('support.resolvedMsg');
    case 'Ticket closed':                 return t('support.closedMsg');
    default:                              return text;
  }
};

export const HeadsetIcon = ({ size = 18, color = COLORS.text }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
    />
  </Svg>
);

export const SendIcon = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22 2 11 13" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 2 15 22l-4-9-9-4 20-7Z" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
