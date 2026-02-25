"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Quiz, Question, AnswerOption } from '@prisma/client';
import { PledgePosterCanvas } from './PledgePosterCanvas';
import { downloadPoster, sharePoster } from '@/utils/downloadPoster';
import { Check, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

type QuestionWithOptions = Omit<Question, 'quizId'> & { 
  answerOptions: Omit<AnswerOption, 'isCorrect' | 'questionId'>[] 
};
type QuizWithQuestions = Quiz & { questions: QuestionWithOptions[] };

type QuizStep = 'form' | 'quiz' | 'preview' | 'success';

interface UserData {
  fullName: string;
  email: string;
  orgId?: string;
}

export function QuizFlow({ quiz }: { quiz: QuizWithQuestions }) {
  const [currentStep, setCurrentStep]         = useState<QuizStep>('form');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [userData, setUserData]               = useState<UserData>({ fullName: '', email: '' });
  const [answers, setAnswers]                 = useState<Record<string, string>>({});
  const [scoreData, setScoreData]             = useState<{ score: number, total: number } | null>(null);

  const goToStep = (step: QuizStep) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(step);
      window.scrollTo(0, 0);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 16);
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Film grain texture */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.03] mix-blend-multiply bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
      {/* Top light gradient */}
      <div className="fixed top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-stone-200/40 to-transparent pointer-events-none z-0" />
      
      <main className={`relative z-10 max-w-2xl flex flex-col justify-center min-h-[90vh] mx-auto px-4 py-12 transition-opacity duration-200 ease-in-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {currentStep === 'form' && (
          <QuizForm 
            quiz={quiz} 
            onSubmit={(data) => { setUserData(data); goToStep('quiz'); }} 
          />
        )}
        {currentStep === 'quiz' && (
          <QuizEngine 
            quiz={quiz} 
            userData={userData}
            onComplete={(answersRecord, scoreRes) => { 
                setAnswers(answersRecord);
                setScoreData(scoreRes);
                goToStep('preview'); 
            }}
          />
        )}
        {currentStep === 'preview' && (
          <QuizCertPreview 
            quiz={quiz} 
            userData={userData}
            scoreData={scoreData}
            onRetake={() => {
                setAnswers({});
                setScoreData(null);
                goToStep('form');
            }}
            onConfirm={() => goToStep('success')} 
          />
        )}
        {currentStep === 'success' && (
          <QuizSuccess 
            quiz={quiz} 
            userData={userData} 
          />
        )}
      </main>
    </div>
  );
}

function QuizForm({ quiz, onSubmit }: { quiz: QuizWithQuestions, onSubmit: (data: UserData) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName && email) onSubmit({ fullName, email });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-xl mx-auto w-full">
      <h2 className="text-2xl font-montserrat font-bold text-gray-900 mb-2">Before we start...</h2>
      <p className="text-gray-500 mb-8">Enter your details for the certificate. No login required.</p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name*</label>
          <input 
            type="text" 
            required 
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            placeholder="How you want your name on the certificate"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address*</label>
          <input 
            type="email" 
            required 
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <button 
          type="submit" 
          disabled={!fullName || !email}
          className={fullName && email
            ? "w-full py-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-semibold transition-colors mt-4"
            : "w-full py-4 rounded-full bg-gray-200 text-gray-400 cursor-not-allowed font-semibold mt-4"}
        >
          Start Quiz →
        </button>
      </form>
    </div>
  );
}

function QuizEngine({ quiz, userData, onComplete }: { 
    quiz: QuizWithQuestions, 
    userData: UserData,
    onComplete: (answers: Record<string, string>, scoreRes: { score: number, total: number }) => void 
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<'idle' | 'selected' | 'verifying' | 'revealed'>('idle');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  const question = quiz.questions[currentIndex];
  
  const isCorrect = selectedOptionId === correctOptionId;
  const mood = answerState === 'revealed' ? (isCorrect ? 'happy' : 'sad') : 'neutral';
  const moodColor = mood === 'neutral' ? 'bg-stone-200' : (mood === 'happy' ? 'bg-teal-500' : 'bg-red-400');

  const handleSelect = (aId: string) => {
    if (answerState !== 'idle') return;
    setSelectedOptionId(aId);
    setAnswerState('selected');
  };

  const handleConfirm = async () => {
    if (answerState !== 'selected' || !selectedOptionId) return;
    setAnswerState('verifying');

    try {
      const res = await fetch('/api/verify-answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: question.id, optionId: selectedOptionId })
      });
      const data = await res.json();
      setCorrectOptionId(data.correctOptionId);
      setAnswerState('revealed');

      setTimeout(async () => {
        const newAnswers = { ...answers, [question.id]: selectedOptionId };
        setAnswers(newAnswers);
        
        if (currentIndex < quiz.questions.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setAnswerState('idle');
          setSelectedOptionId(null);
          setCorrectOptionId(null);
        } else {
          const attemptRes = await fetch('/api/quiz-attempts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  quizId: quiz.id,
                  userName: userData.fullName,
                  userEmail: userData.email,
                  orgId: userData.orgId,
                  answers: newAnswers
              })
          });
          const attemptData = await attemptRes.json();
          onComplete(newAnswers, { score: attemptData.score, total: attemptData.totalQuestions });
        }
      }, 2000); 
    } catch (e) {
        console.error(e);
    }
  };

  const progress = ((currentIndex) / quiz.questions.length) * 100;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-xl mx-auto w-full relative">
      <div className={`fixed bottom-6 right-6 w-12 h-12 rounded-full transition-colors duration-500 shadow-lg ${moodColor}`} />
      
      <div className="mb-8">
        <div className="flex justify-between text-sm font-medium text-gray-500 mb-3">
          <span>Question {currentIndex + 1} of {quiz.questions.length}</span>
        </div>
        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-teal-400 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <h2 className="text-2xl font-inter font-bold text-gray-900 mb-8">{question.text}</h2>

      <div className="space-y-3 mb-8">
        {question.answerOptions.map((opt) => {
            const isSelected = selectedOptionId === opt.id;
            const isActuallyCorrect = correctOptionId === opt.id;
            
            let optStyle = "border-gray-200 hover:border-yellow-400 hover:bg-gray-50";
            if (answerState === 'selected') {
                optStyle = isSelected ? "border-yellow-400 ring-2 ring-yellow-400/20 bg-yellow-50 scale-[1.02]" : "border-gray-200 opacity-75";
            } else if (answerState === 'verifying') {
                optStyle = isSelected ? "border-yellow-400 ring-2 ring-yellow-400/20 bg-yellow-50 animate-pulse" : "border-gray-200 opacity-50";
            } else if (answerState === 'revealed') {
                if (isActuallyCorrect) {
                   optStyle = "border-green-500 bg-green-100 scale-[1.02] text-green-900";
                } else if (isSelected && !isActuallyCorrect) {
                   optStyle = "border-red-500 bg-red-100 text-red-900";
                } else {
                   optStyle = "border-gray-200 opacity-50 blur-[1px]";
                }
            }

            return (
                <button
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    disabled={answerState !== 'idle'}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-300 font-medium text-gray-800 flex justify-between items-center ${optStyle}`}
                >
                    <span>{opt.text}</span>
                    {answerState === 'revealed' && isActuallyCorrect && <Check className="w-5 h-5 text-green-600" />}
                    {answerState === 'revealed' && isSelected && !isActuallyCorrect && <X className="w-5 h-5 text-red-600" />}
                </button>
            );
        })}
      </div>

      <div className="h-16 flex items-center justify-center">
          {answerState === 'selected' && (
              <button onClick={handleConfirm} className="w-full py-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform">
                  Submit Answer
              </button>
          )}
          {answerState === 'verifying' && (
              <div className="flex items-center text-teal-600 font-medium">
                  <Loader2 className="w-5 h-5 animate-spin mr-3" />
                  Verifying Answer...
              </div>
          )}
          {answerState === 'revealed' && (
              <div className="text-gray-500 font-medium animate-pulse">
                  {currentIndex < quiz.questions.length - 1 ? "Next question coming..." : "Calculating final score..."}
              </div>
          )}
      </div>
    </div>
  );
}

function QuizCertPreview({ quiz, userData, scoreData, onRetake, onConfirm }: any) {
  const today = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden w-full max-w-5xl mx-auto flex flex-col md:flex-row">
      <div className="p-10 md:w-2/5 flex flex-col justify-center border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50/50">
        <h2 className="text-3xl font-montserrat font-bold text-gray-900 mb-2">Quiz Complete!</h2>
        <p className="text-gray-600 mb-8">You've unlocked your certificate of completion.</p>
        
        {scoreData && (
          <div className="bg-white rounded-2xl p-6 border border-gray-200 mb-10 shadow-sm text-center">
            <div className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Your Score</div>
            <div className="text-5xl font-ibm-mono font-bold text-teal-500">
               {scoreData.score} <span className="text-2xl text-gray-300">/ {scoreData.total}</span>
            </div>
          </div>
        )}

        <div className="space-y-4 mt-auto">
          <button 
            onClick={onConfirm}
            className="w-full py-4 px-6 rounded-full bg-teal-500 text-white font-bold hover:bg-teal-600 transition-colors shadow-lg shadow-teal-500/20"
          >
            Confirm & Generate
          </button>
          <button 
            onClick={onRetake}
            className="w-full py-4 px-6 rounded-full border-2 border-gray-200 text-gray-600 font-semibold hover:border-gray-300 transition-colors"
          >
           Retake Quiz
          </button>
        </div>
      </div>
      
      <div className="p-10 md:w-3/5 bg-gray-100 flex items-center justify-center">
        <div className="w-full max-w-sm shadow-2xl rounded-xl overflow-hidden pointer-events-none">
          <PledgePosterCanvas 
            userName={userData.fullName}
            pledgeName={quiz.title}
            date={today}
            bgImageUrl={quiz.bgImageUrl}
            width={720}
            isQuiz={true}
          />
        </div>
      </div>
    </div>
  );
}

function QuizSuccess({ quiz, userData }: { quiz: QuizWithQuestions, userData: UserData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const today = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

  const handleDownload = () => {
    if (canvasRef.current) downloadPoster(canvasRef.current, userData.fullName, 'Quiz');
  };

  const handleShare = () => {
    if (canvasRef.current) sharePoster(canvasRef.current, userData.fullName, window.location.href);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center max-w-2xl mx-auto w-full">
      <div className="w-16 h-16 bg-teal-100 text-teal-500 rounded-full flex items-center justify-center mx-auto mb-6">
        <Check className="w-8 h-8" />
      </div>
      <h2 className="text-3xl font-montserrat font-bold text-gray-900 mb-2">🎉 Certificate Ready!</h2>
      <p className="text-gray-600 mb-8">Thank you, {userData.fullName}. Download your certificate and share your knowledge.</p>
      
      <div className="hidden">
        <PledgePosterCanvas 
          ref={canvasRef}
          userName={userData.fullName}
          pledgeName={quiz.title}
          date={today}
          bgImageUrl={quiz.bgImageUrl}
          width={1080}
          isQuiz={true}
        />
      </div>

      <div className="max-w-sm mx-auto mb-8 shadow-xl rounded-xl overflow-hidden pointer-events-none">
         <PledgePosterCanvas 
          userName={userData.fullName}
          pledgeName={quiz.title}
          date={today}
          bgImageUrl={quiz.bgImageUrl}
          width={720}
          isQuiz={true}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto mb-10">
        <button 
          onClick={handleDownload}
          className="flex-1 py-4 px-6 rounded-full bg-teal-500 text-white font-semibold hover:bg-teal-600 shadow-lg shadow-teal-500/20 transition-all flex justify-center"
        >
          ⬇️ Download PNG
        </button>
        <button 
          onClick={handleShare}
          className="flex-1 py-4 px-6 rounded-full bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors"
        >
          📤 Share
        </button>
      </div>

      <div className="pt-8 border-t border-gray-100 flex flex-col sm:flex-row gap-4 justify-center text-sm font-medium">
        <Link href="/quiz" className="text-teal-600 hover:text-teal-700">Take Another Quiz →</Link>
        <span className="hidden sm:inline text-gray-300">|</span>
        <Link href="/organizations" className="text-gray-500 hover:text-gray-800">Bring to Your Organization →</Link>
      </div>
    </div>
  );
}
