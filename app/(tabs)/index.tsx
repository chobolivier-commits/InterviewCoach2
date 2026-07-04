import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
// import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const SECTORS = [
  { id: 'tech', label: 'Tech / Ingénierie', icon: '💻' },
  { id: 'finance', label: 'Finance / Conseil', icon: '📊' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'rh', label: 'RH / Management', icon: '🤝' },
  { id: 'sales', label: 'Commerce', icon: '🎯' },
];

const LEVELS = [
  { id: 'junior', label: 'Junior' },
  { id: 'mid', label: 'Confirmé' },
  { id: 'senior', label: 'Senior' },
];

const COMPANIES = ['Google', 'McKinsey', 'LVMH', 'BNP Paribas', 'Autre'];

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

const speak = async (text: string) => {
  try {
    if (currentSound) {
      await currentSound.unloadAsync();
      currentSound = null;
    }
    const cleanText = cleanForSpeech(text);
    const res = await fetch('https://interview-coach2-sooty.vercel.app/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText }),
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
  async function testerVoixFR() {
    const voices = await Speech.getAvailableVoicesAsync();
    const voixFR = voices.filter(v => v.language.startsWith('fr'));
    console.log('=== VOIX FR DISPONIBLES ===');
    voixFR.forEach((v, i) => {
      console.log(`${i}: ${v.name}| qualité: ${v.quality} | id: ${v.identifier}`);
    });
  }
  const [screen, setScreen] = useState('home');
  const [sector, setSector] = useState<string|null>(null);
  const [level, setLevel] = useState<string|null>(null);
  const [company, setCompany] = useState<string|null>(null);
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
/*
  useSpeechRecognitionEvent('result', (event) => {
    if (event.results[0]) {
      setInput(event.results[0].transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
  });
  */

  const getSystem = () => `Tu es un recruteur senior chez ${company}, pour un poste ${LEVELS.find(l=>l.id===level)?.label} en ${SECTORS.find(s=>s.id===sector)?.label}. Poste: ${role}. Pose UNE question à la fois. Après chaque réponse, réponds UNIQUEMENT en JSON: {"score":0-100,"points_forts":["..."],"points_amelioration":["..."],"conseil":"...","prochaine_question":"..."}. Premier message: présente-toi et pose la première question (sans JSON). Réponds en français. N'utilise jamais de backticks ou blocs de code. Retourne le JSON brut sans formatage.`;

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
      if (cleanText) speak(cleanText);
    } catch (e) {
      setMessages([{ role: 'assistant', content: 'Erreur réseau.' }]);
    }
    setLoading(false);
  };

  const sendAnswer = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
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
      if (feedback?.conseil) speak(feedback.conseil + '. ' + (feedback.prochaine_question || ''));
      else {
        const cleanText = text.replace(/\{[\s\S]*?\}/g, '').trim();
        if (cleanText) speak(cleanText);
      }
      if (questionCount >= 4) setTimeout(() => setScreen('results'), 500);
    } catch (e) {
      setMessages(p => [...p, { role: 'assistant', content: 'Erreur.' }]);
    }
    setLoading(false);
  };

  const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
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
        <TouchableOpacity onPress={testerVoixFR} style={{padding: 10, backgroundColor: 'orange', margin: 10, borderRadius: 8}}>
          <Text style={{color: '#000', fontWeight: '700'}}>TEST VOIX</Text>
          </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  if (screen === 'setup') return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <TouchableOpacity onPress={() => setScreen('home')}><Text style={s.back}>← Retour</Text></TouchableOpacity>
        <Text style={s.title2}>Configure ton entretien</Text>
        <Text style={s.label}>SECTEUR</Text>
        <View style={s.row}>{SECTORS.map(sec => <TouchableOpacity key={sec.id} style={[s.chip, sector===sec.id && s.chipActive]} onPress={() => setSector(sec.id)}><Text style={[s.chipText, sector===sec.id && s.chipTextActive]}>{sec.icon} {sec.label}</Text></TouchableOpacity>)}</View>
        <Text style={s.label}>NIVEAU</Text>
        <View style={s.row}>{LEVELS.map(l => <TouchableOpacity key={l.id} style={[s.chip, level===l.id && s.chipActive]} onPress={() => setLevel(l.id)}><Text style={[s.chipText, level===l.id && s.chipTextActive]}>{l.label}</Text></TouchableOpacity>)}</View>
        <Text style={s.label}>ENTREPRISE</Text>
        <View style={s.row}>{COMPANIES.map(c => <TouchableOpacity key={c} style={[s.chip, company===c && s.chipActive]} onPress={() => setCompany(c)}><Text style={[s.chipText, company===c && s.chipTextActive]}>{c}</Text></TouchableOpacity>)}</View>
        <Text style={s.label}>POSTE VISÉ</Text>
        <TextInput style={s.input} value={role} onChangeText={setRole} placeholder="ex: Product Manager..." placeholderTextColor="#4b5563" />
        <TouchableOpacity style={[s.btn, !(sector&&level&&company&&role.trim()) && s.btnOff]} onPress={startInterview} disabled={!(sector&&level&&company&&role.trim())}>
          <Text style={[s.btnText, !(sector&&level&&company&&role.trim()) && {color:'#4b5563'}]}>Lancer l'entretien →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === 'interview') return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{company} · {role}</Text>
        <Text style={s.headerSub}>{questionCount}/5{scores.length > 0 ? ` · Moy. ${avg}/100` : ''}</Text>
      </View>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView ref={scrollRef} style={{flex:1}} contentContainerStyle={{padding:16}}>
          {messages.map((msg, i) => {
            const isAI = msg.role === 'assistant';
            const displayText = msg.content.replace(/```json[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*?\}/g, '').trim();
            const fb = msg.feedback;
            return (
              <View key={i} style={{marginBottom:16}}>
                {isAI ? (
                  <View>
                    {displayText ? <View style={s.aiBubble}><Text style={s.aiText}>{displayText}</Text></View> : null}
                    {fb?.score !== undefined && (
                      <View style={s.fbCard}>
                        <View style={{flexDirection:'row',alignItems:'center',marginBottom:12}}>
                          <Text style={[s.scoreNum,{color:scoreColor(fb.score)}]}>{fb.score}</Text>
                          <Text style={[s.scoreLabel,{color:scoreColor(fb.score)}]}>{scoreLabel(fb.score)}</Text>
                        </View>
                        {fb.points_forts?.length > 0 && <><Text style={s.fbTitle}>✓ Points forts</Text>{fb.points_forts.map((p:string,j:number)=><Text key={j} style={s.fbItem}>• {p}</Text>)}</>}
                        {fb.points_amelioration?.length > 0 && <><Text style={[s.fbTitle,{color:'#f59e0b'}]}>△ À améliorer</Text>{fb.points_amelioration.map((p:string,j:number)=><Text key={j} style={s.fbItem}>• {p}</Text>)}</>}
                        {fb.conseil && <View style={s.conseilBox}><Text style={s.conseilText}>💡 {fb.conseil}</Text></View>}
                        {fb.prochaine_question && <View style={[s.aiBubble,{marginTop:8}]}><Text style={s.aiText}>{fb.prochaine_question}</Text></View>}
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={s.userBubble}><Text style={s.userText}>{msg.content}</Text></View>
                )}
              </View>
            );
          })}
          {loading && <ActivityIndicator color="#6366f1" style={{marginTop:8}} />}
        </ScrollView>
        <View style={s.inputBar}>
          <TextInput
            style={s.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? '🎤 Parlez...' : 'Ta réponse...'}
            placeholderTextColor={isRecording ? '#ef4444' : '#4b5563'}
            multiline
            editable={!isRecording}
          />
          <TouchableOpacity
            style={[s.micBtn, isRecording && s.micActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={loading}
          >
            <Text style={{fontSize:20}}>{isRecording ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim()||loading) && s.sendOff]}
            onPress={sendAnswer}
            disabled={!input.trim()||loading}
          >
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <Text style={{fontSize:48,marginBottom:16}}>{avg>=75?'🏆':avg>=50?'📈':'💪'}</Text>
        <Text style={s.title2}>Résultat final</Text>
        <Text style={s.sub}>{company} · {role}</Text>
        <View style={s.scoreCircle}>
          <Text style={[s.bigScore,{color:scoreColor(avg)}]}>{avg}</Text>
          <Text style={[s.scoreLabel,{color:scoreColor(avg),fontSize:18}]}>{scoreLabel(avg)}</Text>
          <Text style={{color:'#4b5563',fontSize:13}}>sur {scores.length} questions</Text>
        </View>
        <View style={{flexDirection:'row',gap:12,width:'100%'}}>
          <TouchableOpacity style={[s.btn,{flex:1,backgroundColor:'rgba(255,255,255,0.05)'}]} onPress={startInterview}><Text style={[s.btnText,{color:'#9ca3af'}]}>🔄 Recommencer</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn,{flex:1}]} onPress={()=>setScreen('home')}><Text style={s.btnText}>Nouvel entretien</Text></TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#0A0A0F'},
  center:{flex:1,justifyContent:'center',alignItems:'center',padding:24},
  badge:{color:'#818cf8',fontSize:12,fontWeight:'700',letterSpacing:1,textTransform:'uppercase',marginBottom:24,backgroundColor:'rgba(99,102,241,0.15)',paddingHorizontal:14,paddingVertical:6,borderRadius:20},
  title:{fontSize:36,fontWeight:'800',color:'#fff',textAlign:'center',marginBottom:16,lineHeight:44},
  title2:{fontSize:28,fontWeight:'800',color:'#fff',marginBottom:8},
  accent:{color:'#818cf8'},
  sub:{color:'#9ca3af',fontSize:16,textAlign:'center',lineHeight:24,marginBottom:40},
  btn:{backgroundColor:'#6366f1',borderRadius:14,padding:16,alignItems:'center',marginTop:8},
  btnOff:{backgroundColor:'rgba(99,102,241,0.2)'},
  btnText:{color:'#fff',fontSize:16,fontWeight:'700'},
  back:{color:'#6b7280',fontSize:14,marginBottom:24},
  label:{color:'#9ca3af',fontSize:12,fontWeight:'700',letterSpacing:1,textTransform:'uppercase',marginBottom:10,marginTop:20},
  row:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{backgroundColor:'rgba(255,255,255,0.04)',borderWidth:1,borderColor:'rgba(255,255,255,0.08)',borderRadius:10,paddingHorizontal:14,paddingVertical:10,marginBottom:4},
  chipActive:{backgroundColor:'rgba(99,102,241,0.2)',borderColor:'#6366f1'},
  chipText:{color:'#9ca3af',fontSize:14},
  chipTextActive:{color:'#a5b4fc',fontWeight:'600'},
  input:{backgroundColor:'rgba(255,255,255,0.05)',borderWidth:1,borderColor:'rgba(255,255,255,0.08)',borderRadius:10,padding:14,color:'#fff',fontSize:15,marginTop:4},
  header:{padding:16,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.06)'},
  headerTitle:{color:'#fff',fontSize:15,fontWeight:'600'},
  headerSub:{color:'#6b7280',fontSize:12,marginTop:2},
  aiBubble:{backgroundColor:'rgba(255,255,255,0.05)',borderRadius:14,padding:14,marginBottom:8},
  aiText:{color:'#e5e7eb',fontSize:15,lineHeight:22},
  userBubble:{backgroundColor:'rgba(99,102,241,0.25)',borderRadius:14,padding:14,alignSelf:'flex-end',maxWidth:'80%'},
  userText:{color:'#e5e7eb',fontSize:15,lineHeight:22},
  fbCard:{backgroundColor:'rgba(99,102,241,0.08)',borderWidth:1,borderColor:'rgba(99,102,241,0.2)',borderRadius:14,padding:14,marginBottom:8},
  scoreNum:{fontSize:36,fontWeight:'900',marginRight:12},
  scoreLabel:{fontSize:15,fontWeight:'700'},
  fbTitle:{color:'#22c55e',fontSize:12,fontWeight:'700',textTransform:'uppercase',marginBottom:4,marginTop:8},
  fbItem:{color:'#9ca3af',fontSize:13,lineHeight:20,marginBottom:2},
  conseilBox:{backgroundColor:'rgba(99,102,241,0.1)',borderRadius:8,padding:10,marginTop:8},
  conseilText:{color:'#a5b4fc',fontSize:13,lineHeight:20,fontStyle:'italic'},
  inputBar:{flexDirection:'row',padding:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.06)',gap:8},
  textInput:{flex:1,backgroundColor:'rgba(255,255,255,0.05)',borderWidth:1,borderColor:'rgba(255,255,255,0.1)',borderRadius:12,padding:12,color:'#fff',fontSize:15,maxHeight:100},
  sendBtn:{backgroundColor:'#6366f1',borderRadius:12,width:44,justifyContent:'center',alignItems:'center'},
  sendOff:{backgroundColor:'rgba(99,102,241,0.2)'},
  sendIcon:{color:'#fff',fontSize:20,fontWeight:'700'},
  micBtn:{backgroundColor:'rgba(255,255,255,0.08)',borderRadius:12,width:44,justifyContent:'center',alignItems:'center'},
  micActive:{backgroundColor:'rgba(239,68,68,0.3)',borderWidth:1,borderColor:'#ef4444'},
  scoreCircle:{alignItems:'center',backgroundColor:'rgba(99,102,241,0.1)',borderWidth:1,borderColor:'rgba(99,102,241,0.2)',borderRadius:20,padding:32,marginVertical:24,width:'100%'},
  bigScore:{fontSize:72,fontWeight:'900',lineHeight:80},
});