import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

export default function GuestModeBubble({ onPress, style, visible = true }) {
  const [hue, setHue] = useState(0);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const bubbleSize = Math.round(Math.max(92, Math.min(112, windowWidth * (fontScale > 1.1 ? 0.22 : 0.26))));
  const outerGlowSize = Math.round(bubbleSize * 1.125);
  const bloomSize = Math.round(bubbleSize * 0.77);
  const shadowSize = Math.round(bubbleSize * 0.86);
  const highlightWidth = Math.round(bubbleSize * 0.66);
  const highlightHeight = Math.round(bubbleSize * 0.29);
  const labelFontSize = Math.max(11, Math.min(13, Math.round(bubbleSize * 0.115)));
  const labelLineHeight = Math.round(labelFontSize * 1.23);
  const labelMaxWidth = Math.round(bubbleSize * 0.7);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setHue((current) => (current + 2) % 360);
    }, 60);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <Pressable style={[styles.wrap, style]} onPress={onPress}>
      <View
        style={[
          styles.sphere,
          {
            width: bubbleSize,
            height: bubbleSize,
            borderRadius: bubbleSize / 2,
          },
          {
            backgroundColor: `hsl(${hue} 88% 56%)`,
            borderColor: `hsla(${(hue + 40) % 360} 100% 96% / 0.92)`,
          },
        ]}
      >
        <View
          style={[
            styles.colorBloom,
            {
              width: bloomSize,
              height: bloomSize,
              borderRadius: bloomSize / 2,
              top: Math.round(bubbleSize * 0.09),
              left: Math.round(bubbleSize * 0.09),
            },
            {
              backgroundColor: `hsla(${(hue + 58) % 360} 95% 72% / 0.95)`,
            },
          ]}
        />
        <View
          style={[
            styles.colorShadow,
            {
              width: shadowSize,
              height: shadowSize,
              borderRadius: shadowSize / 2,
              right: Math.round(bubbleSize * -0.07),
              bottom: Math.round(bubbleSize * -0.11),
            },
            {
              backgroundColor: `hsla(${(hue + 215) % 360} 95% 46% / 0.82)`,
            },
          ]}
        />
        <View
          style={[
            styles.outerGlow,
            {
              width: outerGlowSize,
              height: outerGlowSize,
              borderRadius: outerGlowSize / 2,
              transform: [{ translateY: Math.round(bubbleSize * 0.07) }],
            },
            {
              backgroundColor: `hsla(${(hue + 120) % 360} 90% 62% / 0.28)`,
            },
          ]}
        />
        <View
          style={[
            styles.glassHighlight,
            {
              width: highlightWidth,
              height: highlightHeight,
              borderRadius: highlightHeight / 2,
              top: Math.round(bubbleSize * 0.13),
              left: Math.round(bubbleSize * 0.14),
            },
          ]}
        />
        <Text
          style={[
            styles.label,
            {
              fontSize: labelFontSize,
              lineHeight: labelLineHeight,
              maxWidth: labelMaxWidth,
            },
          ]}
        >
          GUEST MODE
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
  sphere: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  outerGlow: {
    position: 'absolute',
  },
  colorBloom: {
    position: 'absolute',
  },
  colorShadow: {
    position: 'absolute',
  },
  glassHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.34)',
    transform: [{ rotate: '-14deg' }],
  },
  label: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'center',
    zIndex: 2,
  },
});
