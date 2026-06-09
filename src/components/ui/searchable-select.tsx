import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface SearchableSelectOption {
  label: string;
  value: string;
}

interface SearchableSelectProps {
  disabled?: boolean;
  emptyMessage: string;
  onSelect: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  selectedLabel?: string;
  title: string;
}

export function SearchableSelect({
  disabled = false,
  emptyMessage,
  onSelect,
  options,
  placeholder,
  searchPlaceholder,
  selectedLabel,
  title,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const close = () => {
    setIsOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setIsOpen(true)}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
      >
        <Text style={selectedLabel ? styles.valueText : styles.placeholderText}>
          {selectedLabel || placeholder}
        </Text>
        <Text style={styles.chevron}>▼</Text>
      </Pressable>

      <Modal animationType="slide" transparent visible={isOpen} onRequestClose={close}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={close}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              style={styles.searchInput}
              value={query}
            />

            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    close();
                  }}
                  style={styles.optionRow}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{emptyMessage}</Text>}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  triggerDisabled: {
    backgroundColor: '#F8FAFC',
    opacity: 0.7,
  },
  valueText: {
    color: '#0F172A',
    fontSize: 15,
    flex: 1,
  },
  placeholderText: {
    color: '#94A3B8',
    fontSize: 15,
    flex: 1,
  },
  chevron: {
    color: '#64748B',
    fontSize: 12,
    marginLeft: 12,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    maxHeight: '75%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeText: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  optionRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  optionText: {
    fontSize: 15,
    color: '#0F172A',
  },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#64748B',
  },
});
