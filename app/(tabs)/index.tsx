import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const callClaude = async (messages: any[], system: string) => {
  const res = await fetch('https://interview-coach2-sooty.vercel.app/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
};

function cleanForSpeech(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/`{1,3}(.*?)`{1,3}/g, '$1')
    .replace(/[_~]/g, '')
    .trim();
}

let currentSound: Audio.Sound | null = null;

const speak = async (text: string, gender: 'homme' | 'femme' = 'homme') => {
  try {
    if (currentSound) {
      await currentSound.unloadAsync();
      currentSound = null;
    }
    const cleanText = cleanForSpeech(text);
    const voice = gender === 'femme' ? 'nova' : 'onyx';
    const res = await fetch('https://interview-coach2-sooty.vercel.app/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, voice }),
    });
    const data = await res.json();
    if (!data.audio) return;
    const uri = `data:audio/mp3;base64,${data.audio}`;
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    currentSound = sound;
  } catch (e) {
    console.log('Erreur speak:', e);
  }
};


export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState('home');
  const [sector, setSector] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [cv, setCv] = useState('');
  const [jobAd, setJobAd] = useState('');
  const [voiceGender, setVoiceGender] = useState<'homme' | 'femme'>('homme');
  const [minQuestions, setMinQuestions] = useState(5);
  const [maxQuestions, setMaxQuestions] = useState(20);
  const [company, setCompany] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

const finalTranscriptRef = useRef('');

useSpeechRecognitionEvent('result', (event) => {
  if (event.results[0]) {
    const transcript = event.results[0].transcript;
    setInput(transcript);
    finalTranscriptRef.current = transcript;
  }
});

useSpeechRecognitionEvent('end', () => {
  setIsRecording(false);
  const transcript = finalTranscriptRef.current.trim();
  if (transcript) {
    sendAnswer(transcript);
    finalTranscriptRef.current = '';
  }
});

  const getSystem = () => `Tu es un recruteur senior chez ${company}, pour un poste de ${role} niveau ${level}, dans le secteur ${sector}. Le recruteur qui mène l'entretien s'appelle d'un prénom lié au genre choisi ${voiceGender === 'femme' ? 'féminin' : 'masculin'}, invente les toi-même.${cv ? `Voici le CV du candidat : ${cv}.` : ''}${jobAd ? `Voici l'annonce du poste : ${jobAd}.` : ''} ${cv || jobAd ? 'Base tes questions sur ces informations pour personnaliser l\'entretien, comme un vrai recruteur qui a lu le dossier du candidat.' : ''}

RÈGLES SUR LE NOMBRE DE QUESTIONS :
Fourchette autorisée : entre ${minQuestions} et ${maxQuestions} questions.
Après chaque réponse, évalue si elle est complète. Si elle est vague ou hors-sujet, tu peux relancer avant de passer à la suite. Si le candidat enchaîne des réponses faibles, tu peux clore avant ${maxQuestions}, comme un vrai recruteur qui n'est plus convaincu — indique-le via "fin_entretien":true et explique pourquoi dans "conseil". Si le candidat s'en sort bien, va jusqu'à ${maxQuestions} pour couvrir un entretien complet. Ne dépasse jamais ${maxQuestions}, ne t'arrête jamais avant ${minQuestions} sauf réponses très hors-sujet répétées.

RÈGLE SUR LA RÉMUNÉRATION :
N'aborde JAMAIS spontanément le salaire, sauf si l'annonce du poste en mentionne un. Dans ce cas, tu peux l'évoquer une seule fois, à un moment naturel (idéalement en fin d'entretien) : "Le poste est annoncé à [montant]. Est-ce en ligne avec vos attentes ?" Si le candidat rebondit, enchaîne sur la négociation. S'il n'y donne pas suite, n'insiste pas et n'y reviens pas.

Pose UNE question à la fois. Après chaque réponse, réponds UNIQUEMENT en JSON: {"score":0-100,"points_forts":["..."],"points_amelioration":["..."],"vocabulaire":"...","conseil":"...","prochaine_question":"...","fin_entretien":false}. Premier message: présente-toi et pose la première question (sans JSON). Réponds en français. N'utilise JAMAIS de markdown (pas d'astérisques, pas de dièses, pas de backticks, pas de tirets). Écris en texte brut uniquement. Retourne le JSON brut sans formatage. Dans "vocabulaire", analyse en une phrase courte le niveau de langage du candidat (mots de remplissage comme "euh"/"du coup", précision du vocabulaire professionnel, répétitions), avec un conseil concret pour l'améliorer.`;

  const startRecording = async () => {
    Speech.stop();
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) return;
    setIsRecording(true);
    setInput('');
    ExpoSpeechRecognitionModule.start({ lang: 'fr-FR', continuous: false });
  };

  const stopRecording = () => {
    ExpoSpeechRecognitionModule.stop();
    setIsRecording(false);
  };

  const startInterview = async () => {
    setScreen('interview');
    setLoading(true);
    setMessages([]);
    setScores([]);
    setQuestionCount(0);
    setHistory([]);
    try {
      const text = await callClaude([{ role: 'user', content: 'Commence.' }], getSystem());
      const aiMsg = { role: 'assistant', content: text };
      setMessages([aiMsg]);
      setHistory([{ role: 'user', content: 'Commence.' }, { role: 'assistant', content: text }]);
      const cleanText = text.replace(/\{[\s\S]*?\}/g, '').trim();
      if (cleanText) speak(cleanText, voiceGender);
    } catch (e) {
      setMessages([{ role: 'assistant', content: 'Erreur réseau.' }]);
    }
    setLoading(false);
  };

const sendAnswer = async (overrideText?: string) => {
  const answerText = overrideText ?? input;
  if (!answerText.trim() || loading) return;
  const userMsg = { role: 'user', content: answerText };
    const newMsgs = [...messages, userMsg];
    const newHistory = [...history.map((m: any) => ({ role: m.role, content: m.content })), userMsg];
    setMessages(newMsgs);
    setHistory(newHistory);
    setInput('');
    setLoading(true);
    try {
      const text = await callClaude(newHistory, getSystem());
      let feedback = null;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          feedback = JSON.parse(match[0]);
          if (feedback.score !== undefined) {
            setScores(p => [...p, feedback.score]);
            setQuestionCount(p => p + 1);
          }
        } catch {}
      }
      const aiMsg = { role: 'assistant', content: text, feedback };
      setMessages([...newMsgs, aiMsg]);
      setHistory([...newHistory, { role: 'assistant', content: text }]);
      if (feedback?.conseil) speak(feedback.conseil + '. ' + (feedback.prochaine_question || ''), voiceGender);
      else {
        const cleanText = text.replace(/\{[\s\S]*?\}/g, '').trim();
        if (cleanText) speak(cleanText, voiceGender);
      }
      if (feedback?.fin_entretien || questionCount >= maxQuestions) setTimeout(() => setScreen('results'), 500);
    } catch (e) {
      setMessages(p => [...p, { role: 'assistant', content: 'Erreur.' }]);
    }
    setLoading(false);
  };

  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const scoreColor = (sc: number) => sc >= 75 ? '#22c55e' : sc >= 50 ? '#f59e0b' : '#ef4444';
  const scoreLabel = (sc: number) => sc >= 80 ? 'Excellent' : sc >= 65 ? 'Bon' : sc >= 50 ? 'Correct' : 'À améliorer';

  if (screen === 'home') return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <Text style={s.badge}>IA • Gratuit • Sans inscription</Text>
        <Text style={s.title}>Décroche ton{'\n'}<Text style={s.accent}>prochain job</Text></Text>
        <Text style={s.sub}>Simule un vrai entretien oral avec un recruteur IA. Reçois un feedback précis sur chaque réponse.</Text>
        <TouchableOpacity style={s.btn} onPress={() => setScreen('setup')}>
          <Text style={s.btnText}>Commencer l'entretien →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  if (screen === 'setup') return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}>
          <TouchableOpacity onPress={() => setScreen('home')}><Text style={s.back}>← Retour</Text></TouchableOpacity>
          <Text style={s.title2}>Configure ton entretien</Text>

          <Text style={s.label}>ENTREPRISE</Text>
          <TextInput
            style={s.textField}
            placeholder="Ex: Google, une startup, ma boîte actuelle..."
            placeholderTextColor="#9C8C79"
            value={company || ''}
            onChangeText={setCompany}
          />

          <Text style={s.label}>POSTE VISÉ</Text>
          <TextInput
            style={s.textField}
            placeholder="Ex: Chef de projet marketing"
            placeholderTextColor="#9C8C79"
            value={role}
            onChangeText={setRole}
          />

          <Text style={s.label}>SECTEUR / DOMAINE</Text>
          <TextInput
            style={s.textField}
            placeholder="Ex: Tech, Finance, Commerce..."
            placeholderTextColor="#9C8C79"
            value={sector || ''}
            onChangeText={setSector}
          />

          <Text style={s.label}>NIVEAU D'EXPÉRIENCE</Text>
          <TextInput
            style={s.textField}
            placeholder="Ex: Junior, Confirmé, Senior..."
            placeholderTextColor="#9C8C79"
            value={level || ''}
            onChangeText={setLevel}
          />
          <Text style={s.label}>VOIX DU RECRUTEUR</Text>
<View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
  <TouchableOpacity
    style={[s.chip, voiceGender === 'homme' && s.chipActive, { flex: 1, alignItems: 'center' }]}
    onPress={() => setVoiceGender('homme')}
  >
    <Text style={[s.chipText, voiceGender === 'homme' && s.chipTextActive]}>👨 Homme</Text>
  </TouchableOpacity>
  <TouchableOpacity
    style={[s.chip, voiceGender === 'femme' && s.chipActive, { flex: 1, alignItems: 'center' }]}
    onPress={() => setVoiceGender('femme')}
  >
    <Text style={[s.chipText, voiceGender === 'femme' && s.chipTextActive]}>👩 Femme</Text>
  </TouchableOpacity>
</View>
<Text style={s.label}>TON CV (optionnel)</Text>
<TextInput
  style={[s.textField, { height: 120, textAlignVertical: 'top' }]}
  placeholder="Colle ici le texte de ton CV pour un entretien plus personnalisé..."
  placeholderTextColor="#9C8C79"
  value={cv}
  onChangeText={setCv}
  multiline
/>

<Text style={s.label}>ANNONCE DU POSTE (optionnel)</Text>
<TextInput
  style={[s.textField, { height: 120, textAlignVertical: 'top' }]}
  placeholder="Colle ici le texte de l'annonce d'embauche..."
  placeholderTextColor="#9C8C79"
  value={jobAd}
  onChangeText={setJobAd}
  multiline
/>
          <TouchableOpacity
            style={[s.btn, { marginTop: 24 }, (!company || !role || !sector || !level) && { opacity: 0.5 }]}
            onPress={startInterview}
            disabled={!company || !role || !sector || !level}
          >
            <Text style={s.btnText}>Démarrer l'entretien →</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  if (screen === 'interview') return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{company} · {role}</Text>
        <Text style={s.headerSub}>{questionCount}/{maxQuestions}{scores.length > 0 ? ` · Moy. ${avg}/100` : ''}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {messages.map((msg, i) => {
            const isAI = msg.role === 'assistant';
            const displayText = msg.content.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
            const fb = msg.feedback;
            return (
              <View key={i} style={{ marginBottom: 16 }}>
                {isAI ? (
                  <View>
                    {displayText ? <View style={s.aiBubble}><Text style={s.aiText}>{displayText}</Text></View> : null}
                    {fb?.score !== undefined && (
                      <View style={s.fbCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={[s.scoreNum, { color: scoreColor(fb.score) }]}>{fb.score}</Text>
                          <Text style={[s.scoreLabel, { color: scoreColor(fb.score) }]}>{scoreLabel(fb.score)}</Text>
                        </View>
                        {fb.points_forts?.length > 0 && <><Text style={s.fbTitle}>✓ Points forts</Text>{fb.points_forts.map((p: string, idx: number) => <Text key={idx} style={s.fbItem}>• {p}</Text>)}</>}
                        {fb.points_amelioration?.length > 0 && <><Text style={[s.fbTitle, { color: '#f59e0b' }]}>△ À améliorer</Text>{fb.points_amelioration.map((p: string, idx: number) => <Text key={idx} style={s.fbItem}>• {p}</Text>)}</>}
                        {fb.vocabulaire && <View style={[s.conseilBox, { marginTop: 8 }]}><Text style={s.conseilText}>📝 {fb.vocabulaire}</Text></View>}
                        {fb.conseil && <View style={s.conseilBox}><Text style={s.conseilText}>💡 {fb.conseil}</Text></View>}
                        {fb.prochaine_question && <View style={[s.aiBubble, { marginTop: 8 }]}><Text style={s.aiText}>{fb.prochaine_question}</Text></View>}
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={s.userBubble}><Text style={s.userText}>{msg.content}</Text></View>
                )}
              </View>
            );
          })}
          {loading && <ActivityIndicator color="#E8552E" style={{ marginTop: 8 }} />}
        </ScrollView>
<View style={[s.inputBar, {paddingBottom: insets.bottom + 8}]}>
  <TextInput
    style={s.textInput}
    value={input}
    editable={false}
    pointerEvents="none"
    placeholder={isRecording ? '🎤 Parlez...' : 'Appuie sur le micro...'}
    placeholderTextColor={isRecording ? '#ef4444' : '#8A7A68'}
    multiline
  />
  <TouchableOpacity
    style={[s.micBtn, isRecording && s.micActive]}
    onPress={isRecording ? stopRecording : startRecording}
    disabled={loading}
  >
    <Text style={{ fontSize: 20 }}>{isRecording ? '■' : '🎤'}</Text>
  </TouchableOpacity>
</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{avg >= 75 ? '🏆' : avg >= 50 ? '📈' : '💪'}</Text>
        <Text style={s.title2}>Résultat final</Text>
        <Text style={s.sub}>{company} · {role}</Text>
        <View style={s.scoreCircle}>
          <Text style={[s.bigScore, { color: scoreColor(avg) }]}>{avg}</Text>
          <Text style={[s.scoreLabel, { color: scoreColor(avg), fontSize: 18 }]}>{scoreLabel(avg)}</Text>
          <Text style={{ color: '#8A7A68', fontSize: 13 }}>sur {scores.length} questions</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
          <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)' }]} onPress={startInterview}><Text style={s.btnText}>🔄 Recommencer</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={() => setScreen('home')}><Text style={s.btnText}>Nouvel entretien</Text></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  chip: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
chipActive: { backgroundColor: 'rgba(232,85,46,0.2)', borderColor: '#E8552E' },
chipText: { color: '#B9AC9C', fontSize: 14 },
chipTextActive: { color: '#FFB37A', fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#1A140F' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  badge: { color: '#F2A65A', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  title: { fontSize: 36, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16, lineHeight: 42 },
  title2: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  accent: { color: '#F2A65A' },
  sub: { color: '#B9AC9C', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40 },
  btn: { backgroundColor: '#E8552E', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnOff: { backgroundColor: 'rgba(232,85,46,0.2)' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  back: { color: '#9C8C79', fontSize: 14, marginBottom: 24 },
  label: { color: '#B9AC9C', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
  textField: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, color: '#fff', fontSize: 15, marginBottom: 16 },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  headerSub: { color: '#9C8C79', fontSize: 12, marginTop: 2 },
  aiBubble: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, marginBottom: 8, maxWidth: '90%' },
  aiText: { color: '#EDE6DD', fontSize: 15, lineHeight: 22 },
  userBubble: { backgroundColor: 'rgba(232,85,46,0.25)', borderRadius: 14, padding: 14, alignSelf: 'flex-end', maxWidth: '85%' },
  userText: { color: '#EDE6DD', fontSize: 15, lineHeight: 22 },
  fbCard: { backgroundColor: 'rgba(232,85,46,0.08)', borderWidth: 1, borderColor: 'rgba(232,85,46,0.2)', borderRadius: 14, padding: 14, marginTop: 8 },
  scoreNum: { fontSize: 36, fontWeight: '900', marginRight: 12 },
  scoreLabel: { fontSize: 15, fontWeight: '700' },
  fbTitle: { color: '#22c55e', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
  fbItem: { color: '#B9AC9C', fontSize: 13, lineHeight: 20, marginBottom: 2 },
  conseilBox: { backgroundColor: 'rgba(232,85,46,0.1)', borderRadius: 8, padding: 10, marginTop: 8 },
  conseilText: { color: '#FFB37A', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  inputBar: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', alignItems: 'center', gap: 8 },
  textInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, color: '#fff', maxHeight: 100 },
  sendBtn: { backgroundColor: '#E8552E', borderRadius: 12, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sendOff: { backgroundColor: 'rgba(232,85,46,0.2)' },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  micBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  micActive: { backgroundColor: 'rgba(239,68,68,0.3)', borderWidth: 1, borderColor: '#ef4444' },
  scoreCircle: { alignItems: 'center', backgroundColor: 'rgba(232,85,46,0.1)', borderWidth: 1, borderColor: 'rgba(232,85,46,0.3)', borderRadius: 100, width: 220, height: 220, justifyContent: 'center', marginBottom: 32, marginTop: 16 },
  bigScore: { fontSize: 72, fontWeight: '900', lineHeight: 80 },
});
