import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Typography, CostTierInfo, BadgeInfo } from '@/constants/theme';

// Primary Button
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  style,
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    variant === 'primary' && styles.buttonPrimary,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'outline' && styles.buttonOutline,
    variant === 'danger' && styles.buttonDanger,
    disabled && styles.buttonDisabled,
    style,
  ];

  const textStyles = [
    styles.buttonText,
    variant === 'outline' && styles.buttonTextOutline,
    variant === 'danger' && styles.buttonTextDanger,
  ];

  const iconColor =
    variant === 'outline' ? Colors.primary :
    variant === 'danger' ? Colors.error :
    Colors.white;

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon && (
        <Ionicons name={icon} size={20} color={iconColor} style={{ marginRight: 8 }} />
      )}
      <Text style={textStyles}>{title}</Text>
    </TouchableOpacity>
  );
}

// Cost Tier Badge
interface CostTierBadgeProps {
  tier: 1 | 2 | 3 | 4;
  size?: 'small' | 'medium';
}

export function CostTierBadge({ tier, size = 'medium' }: CostTierBadgeProps) {
  const info = CostTierInfo[tier];
  const isSmall = size === 'small';

  return (
    <View style={[
      styles.badge,
      { backgroundColor: info.color },
      isSmall && styles.badgeSmall,
    ]}>
      <Text style={[
        styles.badgeText,
        isSmall && styles.badgeTextSmall,
      ]}>
        {info.symbol}
      </Text>
    </View>
  );
}

// Time Badge
interface TimeBadgeProps {
  minutes: number;
}

export function TimeBadge({ minutes }: TimeBadgeProps) {
  return (
    <View style={[styles.badge, styles.badgeTranslucent]}>
      <Ionicons name="time-outline" size={14} color={Colors.white} />
      <Text style={[styles.badgeText, { marginLeft: 4 }]}>{minutes}m</Text>
    </View>
  );
}

// Dietary Badge
interface DietaryBadgeProps {
  badge: string;
  showLabel?: boolean;
}

export function DietaryBadge({ badge, showLabel = false }: DietaryBadgeProps) {
  const info = BadgeInfo[badge];
  if (!info) return null;

  return (
    <View style={[styles.badge, styles.badgeTranslucent]}>
      <Text style={styles.badgeEmoji}>{info.icon}</Text>
      {showLabel && (
        <Text style={[styles.badgeText, { marginLeft: 4 }]}>{info.shortLabel}</Text>
      )}
    </View>
  );
}

// Chip (for filters)
interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Toggle Chip (for onboarding)
interface ToggleChipProps {
  icon: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function ToggleChip({ icon, label, selected, onPress }: ToggleChipProps) {
  return (
    <TouchableOpacity
      style={[styles.toggleChip, selected && styles.toggleChipSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.toggleChipIcon}>{icon}</Text>
      <Text style={[styles.toggleChipLabel, selected && styles.toggleChipLabelSelected]}>
        {label}
      </Text>
      {selected && (
        <Ionicons name="checkmark-circle" size={22} color={Colors.white} />
      )}
    </TouchableOpacity>
  );
}

// Stat Item
interface StatItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
}

export function StatItem({ icon, value, label }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon} size={24} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Toast Component
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

export function Toast({ message, type, visible }: ToastProps) {
  if (!visible) return null;

  const bgColor =
    type === 'success' ? Colors.success :
    type === 'error' ? Colors.error :
    Colors.secondary;

  const iconName: keyof typeof Ionicons.glyphMap =
    type === 'success' ? 'checkmark-circle' :
    type === 'error' ? 'close-circle' :
    'information-circle';

  return (
    <View style={[styles.toast, { backgroundColor: bgColor }]}>
      <Ionicons name={iconName} size={20} color={Colors.white} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

// Empty State
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={60} color={Colors.textTertiary} />
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>}
      {action && (
        <Button
          title={action.label}
          onPress={action.onPress}
          style={{ marginTop: Spacing.lg }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Button styles
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.md,
  },
  buttonPrimary: {
    backgroundColor: Colors.primary,
  },
  buttonSecondary: {
    backgroundColor: Colors.secondary,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  buttonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextOutline: {
    color: Colors.primary,
  },
  buttonTextDanger: {
    color: Colors.error,
  },

  // Badge styles
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeTranslucent: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  badgeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  badgeTextSmall: {
    fontSize: 12,
  },
  badgeEmoji: {
    fontSize: 16,
  },

  // Chip styles
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundSecondary,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.white,
  },

  // Toggle chip styles
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.backgroundSecondary,
    marginBottom: Spacing.sm,
  },
  toggleChipSelected: {
    backgroundColor: Colors.primary,
  },
  toggleChipIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  toggleChipLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
  },
  toggleChipLabelSelected: {
    color: Colors.white,
  },

  // Stat item styles
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },

  // Toast styles
  toast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: BorderRadius.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  toastText: {
    color: Colors.white,
    fontSize: 15,
    marginLeft: 8,
    flex: 1,
  },

  // Empty state styles
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
