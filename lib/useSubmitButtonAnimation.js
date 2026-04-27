import { Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';

export default function useSubmitButtonAnimation(isVisible) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: isVisible ? 1 : 0,
        duration: isVisible ? 220 : 140,
        easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(translateY, {
        toValue: isVisible ? 0 : 16,
        duration: isVisible ? 260 : 140,
        easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]).start();
  }, [isVisible, opacity, translateY]);

  return {
    opacity,
    transform: [{ translateY }],
  };
}
