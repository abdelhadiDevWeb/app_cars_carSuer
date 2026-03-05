import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getPadding, getFontSizes, scale } from '@/utils/responsive';

const padding = getPadding();
const fontSizes = getFontSizes();

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "Comment utiliser cette plateforme ?",
    answer: "C'est très simple ! Commencez par créer un compte gratuit. Une fois connecté, vous pourrez contacter les vendeurs certifiés, consulter les véhicules vérifiés, et même vendre votre propre véhicule. Pour vendre, vous devrez d'abord prendre rendez-vous avec un atelier de vérification (mécanique et/ou peinture) qui examinera votre véhicule et générera un rapport PDF détaillé."
  },
  {
    question: "Quels sont les avantages de cette plateforme ?",
    answer: "Notre plateforme offre plusieurs avantages uniques : 1) Transparence totale : chaque véhicule est vérifié par des ateliers certifiés avant la vente, 2) Rapports détaillés : vous recevez un PDF complet avec toutes les informations sur l'état du véhicule, 3) Vendeurs certifiés : tous les vendeurs sont vérifiés et certifiés, 4) Sécurité : vous savez exactement ce que vous achetez, contrairement aux autres sites où les informations peuvent être trompeuses."
  },
  {
    question: "Pourquoi choisir CarSure DZ plutôt qu'un autre site ?",
    answer: "Contrairement aux autres sites de vente de véhicules, CarSure DZ garantit la transparence et la vérité sur chaque véhicule. Avant qu'une voiture soit mise en vente, elle doit être vérifiée par un atelier certifié qui génère un rapport PDF complet. Cela signifie que vous voyez la vérité sur la voiture - ses défauts, son état réel, et tout ce que vous devez savoir - avant d'acheter. Sur d'autres sites, vous ne découvrez souvent les problèmes qu'après l'achat."
  },
  {
    question: "Comment puis-je vendre mon véhicule ?",
    answer: "Pour vendre votre véhicule, suivez ces étapes : 1) Créez un compte et connectez-vous, 2) Accédez à votre tableau de bord vendeur, 3) Ajoutez votre véhicule avec toutes les informations, 4) Prenez rendez-vous avec un atelier de vérification (mécanique et/ou peinture selon vos besoins), 5) L'atelier examinera votre véhicule et créera un rapport PDF détaillé, 6) Une fois le rapport disponible, votre véhicule sera automatiquement mis en ligne et visible par les acheteurs."
  },
  {
    question: "Comment fonctionne le processus de vérification ?",
    answer: "Le processus de vérification est simple et transparent : 1) Vous prenez rendez-vous avec un atelier certifié (mécanique, peinture, ou les deux), 2) Vous amenez votre véhicule à l'atelier au jour et à l'heure convenus, 3) L'atelier effectue une inspection complète de votre véhicule, 4) L'atelier génère un rapport PDF détaillé avec toutes les informations (état mécanique, peinture, défauts, etc.), 5) Ce rapport est automatiquement associé à votre annonce, permettant aux acheteurs de voir l'état réel du véhicule."
  },
  {
    question: "Puis-je contacter les vendeurs directement ?",
    answer: "Oui ! Une fois que vous avez créé un compte, vous pouvez contacter directement les vendeurs certifiés via notre système de messagerie intégré. Vous pouvez poser des questions, demander des informations supplémentaires, et négocier en toute sécurité sur la plateforme."
  },
  {
    question: "Les vendeurs sont-ils vérifiés ?",
    answer: "Absolument ! Tous les vendeurs sur notre plateforme sont certifiés et vérifiés. Nous vérifions leur identité, leur statut, et nous nous assurons qu'ils respectent nos standards de qualité. Seuls les vendeurs avec le statut 'certifié' et 'actif' peuvent vendre sur la plateforme."
  },
  {
    question: "Combien coûte l'utilisation de la plateforme ?",
    answer: "La création d'un compte et la consultation des véhicules sont gratuites. Pour vendre un véhicule, vous devrez payer les frais de vérification à l'atelier que vous choisissez. Ces frais varient selon le type de vérification (mécanique, peinture, ou les deux) et l'atelier sélectionné. Les prix sont transparents et affichés sur chaque atelier."
  },
  {
    question: "Que contient le rapport PDF de vérification ?",
    answer: "Le rapport PDF généré par l'atelier contient toutes les informations importantes sur le véhicule : l'état mécanique complet, l'état de la peinture, les défauts détectés, les réparations effectuées, l'historique, et toutes les autres informations pertinentes. Ce rapport est votre garantie de transparence et permet aux acheteurs de prendre une décision éclairée."
  },
  {
    question: "Puis-je faire confiance aux rapports de vérification ?",
    answer: "Oui, vous pouvez avoir une confiance totale ! Tous les ateliers sur notre plateforme sont certifiés et vérifiés. Ils doivent respecter des standards stricts de qualité et de transparence. Les rapports sont générés de manière professionnelle et contiennent toutes les informations nécessaires pour que vous puissiez prendre une décision en toute connaissance de cause."
  }
];

export default function FAQScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(600).springify()}
          style={styles.header}
        >
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 255, 255, 0.95)']}
            style={styles.headerGradient}
          >
            <ThemedText style={styles.title}>Questions Fréquentes</ThemedText>
            <ThemedText style={styles.subtitle}>
              Trouvez les réponses à toutes vos questions sur CarSure DZ
            </ThemedText>
          </LinearGradient>
        </Animated.View>

        {/* FAQ Items */}
        <View style={styles.faqContainer}>
          {faqs.map((faq, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.duration(600).delay(index * 50).springify()}
              style={styles.faqItem}
            >
              <TouchableOpacity
                onPress={() => toggleFAQ(index)}
                style={styles.faqHeader}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.faqQuestion}>{faq.question}</ThemedText>
                <IconSymbol
                  name={openIndex === index ? 'chevron.up' : 'chevron.down'}
                  size={scale(20)}
                  color="#0d9488"
                />
              </TouchableOpacity>
              {openIndex === index && (
                <View style={styles.faqAnswerContainer}>
                  <ThemedText style={styles.faqAnswer}>{faq.answer}</ThemedText>
                </View>
              )}
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: padding.large * 2,
  },
  header: {
    marginBottom: padding.large,
    borderRadius: scale(24),
    overflow: 'hidden',
    marginHorizontal: padding.horizontal,
    marginTop: padding.medium,
  },
  headerGradient: {
    padding: padding.large,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSizes['3xl'],
    fontWeight: '900',
    color: '#0d9488',
    marginBottom: padding.small,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: '#64748b',
    textAlign: 'center',
  },
  faqContainer: {
    paddingHorizontal: padding.horizontal,
    gap: padding.medium,
  },
  faqItem: {
    backgroundColor: '#ffffff',
    borderRadius: scale(16),
    overflow: 'hidden',
    borderWidth: scale(1),
    borderColor: '#e5e7eb',
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: padding.medium,
    gap: padding.small,
  },
  faqQuestion: {
    flex: 1,
    fontSize: fontSizes.md,
    fontWeight: '700',
    color: '#1f2937',
  },
  faqAnswerContainer: {
    paddingHorizontal: padding.medium,
    paddingBottom: padding.medium,
  },
  faqAnswer: {
    fontSize: fontSizes.sm,
    color: '#64748b',
    lineHeight: fontSizes.sm * 1.6,
  },
});
