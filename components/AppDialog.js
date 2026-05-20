import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { UI } from '../lib/uiTheme';

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

export function showAppDialog(title, message, buttons, options = {}) {
  const payload = {
    title: normalizeDialogText(title),
    message: normalizeDialogText(message),
    buttons: normalizeButtons(buttons),
    onClose: typeof options?.onClose === 'function' ? options.onClose : null,
    dismissible: options?.dismissible !== false,
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
  const dialogRef = React.useRef(null);

  useEffect(() => {
    const listener = (payload) => {
      dialogRef.current?.onClose?.('replaced');
      dialogRef.current = payload;
      setDialog(payload);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      dialogRef.current?.onClose?.('unmounted');
      dialogRef.current = null;
    };
  }, []);

  const handlePress = async (button) => {
    const currentDialog = dialogRef.current;
    dialogRef.current = null;
    setDialog(null);
    await button?.onPress?.();
    await currentDialog?.onClose?.('action');
  };

  const buttons = normalizeButtons(dialog?.buttons);

  return (
    <Modal
      visible={Boolean(dialog)}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (dialogRef.current?.dismissible === false) {
          return;
        }
        dialogRef.current?.onClose?.('request_close');
        dialogRef.current = null;
        setDialog(null);
      }}
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
    backgroundColor: UI.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: UI.modal.overlayPadding,
  },
  card: {
    width: '100%',
    maxWidth: UI.modal.maxWidth,
    borderRadius: UI.radius.modal,
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
    paddingHorizontal: UI.spacing.modal,
    paddingTop: UI.spacing.modal,
    paddingBottom: UI.spacing.card,
  },
  title: {
    fontSize: UI.modal.titleSize,
    fontWeight: '900',
    color: UI.colors.primary,
    marginBottom: 10,
  },
  message: {
    fontSize: UI.modal.bodySize,
    lineHeight: UI.modal.bodyLineHeight,
    color: UI.colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: UI.spacing.gap - 2,
    marginTop: 18,
  },
  buttonSlot: {
    flex: 1,
  },
  button: {
    width: '100%',
    minHeight: UI.modal.buttonMinHeight,
    borderRadius: UI.radius.button,
    backgroundColor: UI.colors.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: UI.colors.surface,
    borderWidth: 1,
    borderColor: UI.colors.border,
  },
  buttonDestructive: {
    backgroundColor: UI.colors.danger,
  },
  buttonText: {
    color: UI.colors.surface,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  buttonSecondaryText: {
    color: UI.colors.primary,
  },
});
