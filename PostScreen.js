import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 100;
const BODY_MIN_LENGTH = 1;
const BODY_MAX_LENGTH = 1000;

function getCounterText(length, minLength, maxLength) {
  if (length < minLength) {
    return `${length}/${minLength}`;
  }

  return `${length}/${maxLength}`;
}

function EpsuPickerItem({ item, isSelected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.epsuItem, isSelected && styles.epsuItemSelected]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.85}
    >
      <View style={[styles.epsuIcon, isSelected && styles.epsuIconSelected]}>
        <Text style={styles.epsuIconText}>{item.code}</Text>
      </View>
      <View style={styles.epsuTextWrap}>
        <Text style={[styles.epsuName, isSelected && styles.epsuNameSelected]}>{item.name}</Text>
        <Text style={[styles.epsuMeta, isSelected && styles.epsuMetaSelected]}>Post to this Epsu</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PostScreen({ navigation, route, onSubmitPost, epsus }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedEpsuId, setSelectedEpsuId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const handledReplyNonce = useRef(null);
  const filteredEpsus = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return epsus;
    return epsus.filter((epsu) => epsu.name.toLowerCase().includes(normalizedQuery));
  }, [epsus, searchQuery]);

  const isTitleReady = title.trim().length >= TITLE_MIN_LENGTH;
  const isBodyReady = body.trim().length >= BODY_MIN_LENGTH;
  const canSubmit = isTitleReady && isBodyReady && !!selectedEpsuId;

  useEffect(() => {
    Animated.timing(buttonOpacity, {
      toValue: canSubmit ? 1 : 0,
      duration: canSubmit ? 2000 : 180,
      useNativeDriver: true,
    }).start();
  }, [buttonOpacity, canSubmit]);

  useEffect(() => {
    const replyNonce = route?.params?.replyNonce;
    const replyTitle = route?.params?.replyTitle;
    const replyEpsuId = route?.params?.epsuId;

    if (!replyNonce || handledReplyNonce.current === replyNonce) {
      return;
    }

    handledReplyNonce.current = replyNonce;
    setTitle(replyTitle ?? '');
    setBody('');
    setSearchQuery('');
    if (replyEpsuId) {
      setSelectedEpsuId(replyEpsuId);
    }
  }, [route?.params]);

  const handleTitleChange = (value) => {
    if (value.length <= TITLE_MAX_LENGTH) {
      setTitle(value);
    }
  };

  const handleBodyChange = (value) => {
    if (value.length <= BODY_MAX_LENGTH) {
      setBody(value);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    onSubmitPost({
      epsuId: selectedEpsuId,
      title: title.trim(),
      body: body.trim(),
      replyToPostId: route?.params?.replyToPostId ?? null,
    });

    setTitle('');
    setBody('');
    navigation.navigate('Home', {
      screen: 'HomeEpsu',
      params: { epsuId: selectedEpsuId },
    });
  };

  const handleSelectEpsu = (epsuId) => {
    setSelectedEpsuId(epsuId);
    setSearchQuery('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>Write a post</Text>
          <Text style={styles.sectionTitle}>Choose Epsu for post</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search your Epsus"
            placeholderTextColor="#8d6676"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {selectedEpsuId ? (
            <View style={styles.selectedWrap}>
              <Text style={styles.selectedLabel}>Selected Epsu</Text>
              {epsus
                .filter((epsu) => epsu.id === selectedEpsuId)
                .map((epsu) => (
                  <EpsuPickerItem
                    key={epsu.id}
                    item={epsu}
                    isSelected
                    onPress={handleSelectEpsu}
                  />
                ))}
            </View>
          ) : null}

          {searchQuery.trim() ? (
            <View style={styles.epsuList}>
              {filteredEpsus.map((epsu) => (
                <EpsuPickerItem
                  key={epsu.id}
                  item={epsu}
                  isSelected={epsu.id === selectedEpsuId}
                  onPress={handleSelectEpsu}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.searchHint}>Search to choose an Epsu</Text>
          )}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.counter}>
            {getCounterText(title.length, TITLE_MIN_LENGTH, TITLE_MAX_LENGTH)}
          </Text>
          <TextInput
            style={styles.titleInput}
            placeholder="Title"
            placeholderTextColor="#8d6676"
            value={title}
            onChangeText={handleTitleChange}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.counter}>
            {getCounterText(body.length, BODY_MIN_LENGTH, BODY_MAX_LENGTH)}
          </Text>
          <TextInput
            style={styles.bodyInput}
            placeholder="Write your thoughts here (be respectful and kind! 🌸)"
            placeholderTextColor="#8d6676"
            value={body}
            onChangeText={handleBodyChange}
            multiline
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      <Animated.View
        pointerEvents={canSubmit ? 'auto' : 'none'}
        style={[
          styles.submitWrap,
          {
            paddingBottom: insets.bottom + 16,
            opacity: buttonOpacity,
          },
        ]}
      >
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={styles.submitText}>Submit</Text>
        </TouchableOpacity>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff8fb',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 110,
    gap: 18,
  },
  section: {
    gap: 10,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#20131a',
  },
  epsuList: {
    gap: 10,
  },
  selectedWrap: {
    gap: 8,
  },
  selectedLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8d6676',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  searchInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#24171d',
  },
  searchHint: {
    fontSize: 14,
    color: '#8d6676',
  },
  epsuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f3d0dd',
  },
  epsuItemSelected: {
    backgroundColor: '#e52b50',
    borderColor: '#e52b50',
  },
  epsuIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f7dbe5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  epsuIconSelected: {
    backgroundColor: '#fff',
  },
  epsuIconText: {
    color: '#e52b50',
    fontSize: 15,
    fontWeight: '900',
  },
  epsuTextWrap: {
    flex: 1,
  },
  epsuName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#211319',
    marginBottom: 3,
  },
  epsuNameSelected: {
    color: '#fff',
  },
  epsuMeta: {
    fontSize: 13,
    color: '#7f6170',
  },
  epsuMetaSelected: {
    color: 'rgba(255,255,255,0.82)',
  },
  fieldBlock: {
    gap: 8,
  },
  counter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8a5e70',
  },
  titleInput: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#24171d',
    fontWeight: '600',
  },
  bodyInput: {
    minHeight: 220,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3d0dd',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    lineHeight: 24,
    color: '#24171d',
  },
  submitWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
  },
  submitButton: {
    backgroundColor: '#e52b50',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
