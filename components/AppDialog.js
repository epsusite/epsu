import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const listeners = new Set();

function normalizeDialogText(value) {
  if (typeof value !== 'string') {
    return value ?? '';
  }

  return value
    .split('\n')
    .map((line) => line.replace(/\.\s*$/u, ''))
    .join('\n')
    .trim();
}

function normalizeButtons(buttons) {
  const sourceButtons = buttons?.length ? buttons : [{ text: 'OK' }];

  return sourceButtons.map((button) => ({
    ...button,
    text: normalizeDialogText(button?.text),
  }));
}

export function showAppDialog(title, message, buttons) {
  const payload = {
    title: normalizeDialogText(title),
    message: normalizeDialogText(message),
    buttons: normalizeButtons(buttons),
  };
  listeners.forEach((listener) => listener(payload));
}

function DialogButton({ button, onPress }) {
  const isCancel = button.style === 'cancel';
  const isDestructive = button.style === 'destructive';

  return (
    <Pressable
      style={styles.buttonSlot}
      onPress={() => {
        void onPress(button);
      }}
    >
      <View
        style={[
          styles.button,
          isCancel && styles.buttonSecondary,
          isDestructive && styles.buttonDestructive,
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            isCancel && styles.buttonSecondaryText,
          ]}
        >
          {button.text}
        </Text>
      </View>
    </Pressable>
  );
}

export function AppDialogHost() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const listener = (payload) => setDialog(payload);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const handlePress = async (button) => {
    setDialog(null);
    await button?.onPress?.();
  };

  const buttons = normalizeButtons(dialog?.buttons);

  return (
    <Modal
      visible={Boolean(dialog)}
      transparent
      animationType="fade"
      onRequestClose={() => setDialog(null)}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {dialog?.title ? <Text style={styles.title}>{dialog.title}</Text> : null}
          {dialog?.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          <View style={styles.actions}>
            {buttons.map((button, index) => (
              <DialogButton
                key={`${button.text}-${index}`}
                button={button}
                onPress={handlePress}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(32, 19, 26, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f2d8e0',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#e52b50',
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6d4f5c',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 18,
  },
  buttonSlot: {
    flex: 1,
  },
  button: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#e52b50',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#efbcc9',
  },
  buttonDestructive: {
    backgroundColor: '#c81f43',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  buttonSecondaryText: {
    color: '#e52b50',
  },
});
