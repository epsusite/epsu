import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';
import { Linking, Text } from 'react-native';

type Props = ComponentProps<typeof Text> & { href: string };

export function ExternalLink({ href, onPress, ...rest }: Props) {
  return (
    <Text
      {...rest}
      onPress={async (event) => {
        await onPress?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (process.env.EXPO_OS !== 'web') {
          await openBrowserAsync(href, {
            presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
          });
          return;
        }

        await Linking.openURL(href);
      }}
    />
  );
}
