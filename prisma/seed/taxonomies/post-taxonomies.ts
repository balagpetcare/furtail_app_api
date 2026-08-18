import { PrismaClient } from '@prisma/client';

export async function seedPostTaxonomies(prisma: PrismaClient) {
  // Seed PostFeeling
  const feelings = [
    { key: 'happy', label: 'Happy', emoji: '😊' },
    { key: 'sad', label: 'Sad', emoji: '😢' },
    { key: 'excited', label: 'Excited', emoji: '🤩' },
    { key: 'blessed', label: 'Blessed', emoji: '🙏' },
    { key: 'loved', label: 'Loved', emoji: '🥰' },
    { key: 'tired', label: 'Tired', emoji: '😴' },
    { key: 'proud', label: 'Proud', emoji: '😎' },
    { key: 'angry', label: 'Angry', emoji: '😡' },
    { key: 'relaxed', label: 'Relaxed', emoji: '😌' },
    { key: 'thankful', label: 'Thankful', emoji: '🤗' },
    { key: 'hopeful', label: 'Hopeful', emoji: '🌟' },
    { key: 'emotional', label: 'Emotional', emoji: '😥' },
    { key: 'confused', label: 'Confused', emoji: '😕' },
    { key: 'worried', label: 'Worried', emoji: '😟' },
    { key: 'sick', label: 'Sick', emoji: '🤒' },
    { key: 'sleepy', label: 'Sleepy', emoji: '😪' },
    { key: 'motivated', label: 'Motivated', emoji: '💪' },
    { key: 'grateful', label: 'Grateful', emoji: '💖' },
    { key: 'peaceful', label: 'Peaceful', emoji: '🕉' },
    { key: 'surprised', label: 'Surprised', emoji: '😮' },
    { key: 'funny', label: 'Funny', emoji: '😄' },
    { key: 'cute', label: 'Cute', emoji: '🥺' },
    { key: 'cool', label: 'Cool', emoji: '😎' },
    { key: 'nervous', label: 'Nervous', emoji: '😬' },
  ];

  for (const feeling of feelings) {
    await prisma.postFeeling.upsert({
      where: { key: feeling.key },
      update: { label: feeling.label, emoji: feeling.emoji, isActive: true },
      create: { key: feeling.key, label: feeling.label, emoji: feeling.emoji, isActive: true },
    });
  }

  // Seed PostActivity
  const activities = [
    // General activities
    { key: 'watching', label: 'Watching', emoji: '🎬', category: 'Activities' },
    { key: 'listening', label: 'Listening', emoji: '🎧', category: 'Activities' },
    { key: 'reading', label: 'Reading', emoji: '📖', category: 'Activities' },
    { key: 'playing', label: 'Playing', emoji: '🎮', category: 'Activities' },
    { key: 'traveling', label: 'Traveling', emoji: '✈️', category: 'Activities' },
    { key: 'eating', label: 'Eating', emoji: '🍽', category: 'Activities' },
    { key: 'drinking', label: 'Drinking', emoji: '☕', category: 'Activities' },
    { key: 'celebrating', label: 'Celebrating', emoji: '🎉', category: 'Activities' },
    { key: 'working', label: 'Working', emoji: '💼', category: 'Activities' },
    { key: 'shopping', label: 'Shopping', emoji: '🛍', category: 'Activities' },
    { key: 'cooking', label: 'Cooking', emoji: '👨‍🍳', category: 'Activities' },
    { key: 'exercising', label: 'Exercising', emoji: '🏃', category: 'Activities' },
    { key: 'walking', label: 'Walking', emoji: '🚶', category: 'Activities' },
    { key: 'resting', label: 'Resting', emoji: '🛌', category: 'Activities' },

    // Pet Care
    { key: 'with_pet', label: 'With my pet', emoji: '🐾', category: 'Pet Care' },
    { key: 'feeding_pet', label: 'Feeding my pet', emoji: '🍽', category: 'Pet Care' },
    { key: 'grooming', label: 'Grooming my pet', emoji: '🧼', category: 'Pet Care' },
    { key: 'bathing', label: 'Bathing my pet', emoji: '🛁', category: 'Pet Care' },
    { key: 'walking_dog', label: 'Walking my dog', emoji: '🐕', category: 'Pet Care' },
    { key: 'playing_cat', label: 'Playing with cat', emoji: '🐈', category: 'Pet Care' },
    { key: 'training', label: 'Training my pet', emoji: '🎓', category: 'Pet Care' },
    { key: 'pet_shopping', label: 'Pet shopping', emoji: '🛍', category: 'Pet Care' },
    { key: 'pet_birthday', label: 'Pet birthday', emoji: '🎂', category: 'Pet Care' },
    { key: 'pet_photoshoot', label: 'Pet photo shoot', emoji: '📸', category: 'Pet Care' },
    { key: 'pet_playtime', label: 'Pet playtime', emoji: '🧸', category: 'Pet Care' },
    { key: 'cleaning_litter', label: 'Cleaning litter box', emoji: '🧹', category: 'Pet Care' },
    { key: 'giving_treats', label: 'Giving treats', emoji: '🧈', category: 'Pet Care' },
    { key: 'cuddling', label: 'Cuddling my pet', emoji: '🤗', category: 'Pet Care' },
    { key: 'sleeping_pet', label: 'Sleeping with pet', emoji: '😴', category: 'Pet Care' },

    // Health & Vet
    { key: 'vet_visit', label: 'Vet visit', emoji: '🩺', category: 'Health & Vet' },
    { key: 'pet_vaccination', label: 'Pet vaccination', emoji: '💉', category: 'Health & Vet' },
    { key: 'deworming', label: 'Deworming', emoji: '💊', category: 'Health & Vet' },
    { key: 'pet_checkup', label: 'Pet checkup', emoji: '🏥', category: 'Health & Vet' },
    { key: 'pet_recovery', label: 'Pet recovery', emoji: '❤️‍🩹', category: 'Health & Vet' },
    { key: 'pet_medicine', label: 'Pet medicine', emoji: '💊', category: 'Health & Vet' },
    { key: 'emergency_care', label: 'Emergency care', emoji: '🚑', category: 'Health & Vet' },
    { key: 'surgery_care', label: 'Surgery care', emoji: '🏥', category: 'Health & Vet' },
    { key: 'dental_care', label: 'Dental care', emoji: '🦷', category: 'Health & Vet' },
    { key: 'health_concern', label: 'Health concern', emoji: '⚠️', category: 'Health & Vet' },

    // Lost & Rescue
    { key: 'searching_lost', label: 'Searching lost pet', emoji: '🔍', category: 'Lost & Rescue' },
    { key: 'found_pet', label: 'Found a pet', emoji: '🐾', category: 'Lost & Rescue' },
    { key: 'rescuing', label: 'Rescuing pet', emoji: '🚒', category: 'Lost & Rescue' },
    { key: 'adoption_day', label: 'Adoption day', emoji: '🏡', category: 'Lost & Rescue' },
    { key: 'looking_adopter', label: 'Looking for adopter', emoji: '❤️', category: 'Lost & Rescue' },
    { key: 'foster_care', label: 'Foster care', emoji: '🏠', category: 'Lost & Rescue' },
    { key: 'reunited', label: 'Reunited with pet', emoji: '🤝', category: 'Lost & Rescue' },
    { key: 'helping_stray', label: 'Helping stray animals', emoji: '🐕', category: 'Lost & Rescue' },
    { key: 'feeding_stray', label: 'Feeding stray animals', emoji: '🍲', category: 'Lost & Rescue' },
    { key: 'animal_welfare', label: 'Animal welfare', emoji: '💚', category: 'Lost & Rescue' },
  ];

  for (const [i, activity] of activities.entries()) {
    await prisma.postActivity.upsert({
      where: { key: activity.key },
      update: {
        label: activity.label,
        emoji: activity.emoji,
        category: activity.category,
        sortOrder: i,
        isActive: true
      },
      create: {
        key: activity.key,
        label: activity.label,
        emoji: activity.emoji,
        category: activity.category,
        sortOrder: i,
        isActive: true
      },
    });
  }

  // Seed PostCategoryTaxonomy
  const categories = [
    { key: 'general', label: 'General', sortOrder: 0 },
    { key: 'fundraising', label: 'Fundraising', sortOrder: 1 },
  ];

  for (const category of categories) {
    await prisma.postCategoryTaxonomy.upsert({
      where: { key: category.key },
      update: { label: category.label, isActive: true },
      create: { key: category.key, label: category.label, sortOrder: category.sortOrder, isActive: true },
    });
  }

  // Seed ContentTag (commonly used topics)
  const tags = [
    { key: 'cats', label: '#Cats', sortOrder: 0 },
    { key: 'dogs', label: '#Dogs', sortOrder: 1 },
    { key: 'dog_care', label: '#DogCare', sortOrder: 2 },
    { key: 'vaccination', label: '#Vaccination', sortOrder: 3 },
    { key: 'rescue', label: '#Rescue', sortOrder: 4 },
    { key: 'adoption', label: '#Adoption', sortOrder: 5 },
    { key: 'pet_health', label: '#PetHealth', sortOrder: 6 },
    { key: 'training', label: '#Training', sortOrder: 7 },
    { key: 'lost_pet', label: '#LostPet', sortOrder: 8 },
  ];

  for (const tag of tags) {
    await prisma.contentTag.upsert({
      where: { key: tag.key },
      update: { label: tag.label, isActive: true },
      create: { key: tag.key, label: tag.label, sortOrder: tag.sortOrder, isActive: true },
    });
  }

  // Seed BackgroundStyle. Keys and sortOrder are the stable, Flutter-shared
  // canonical IDs — must never change once posts may reference them
  // (furtail_app/lib/features/posts/presentation/widgets/post_background_style.dart's
  // PostBackgroundStyle.presets). colorValue/colorValueEnd are the exact
  // gradient stops Flutter renders for each id, so Web's caption preview
  // and feed rendering visually match the mobile app instead of degrading
  // to a flat approximation of a gradient.
  const backgroundStyles = [
    { key: 'none', label: 'None', styleType: 'solid', colorValue: null, colorValueEnd: null, textColor: '#000000', sortOrder: 0 },
    { key: 'orange_red', label: 'Sunset Orange', styleType: 'gradient', colorValue: '#FF512F', colorValueEnd: '#DD2476', textColor: '#FFFFFF', sortOrder: 1 },
    { key: 'blue_purple', label: 'Neon Blue', styleType: 'gradient', colorValue: '#00C6FF', colorValueEnd: '#0072FF', textColor: '#FFFFFF', sortOrder: 2 },
    { key: 'dark_purple', label: 'Deep Purple', styleType: 'gradient', colorValue: '#833AB4', colorValueEnd: '#FD1D1D', textColor: '#FFFFFF', sortOrder: 3 },
    { key: 'green_teal', label: 'Ocean Breeze', styleType: 'gradient', colorValue: '#11998E', colorValueEnd: '#38EF7D', textColor: '#FFFFFF', sortOrder: 4 },
    { key: 'midnight', label: 'Midnight', styleType: 'gradient', colorValue: '#232526', colorValueEnd: '#414345', textColor: '#FFFFFF', sortOrder: 5 },
  ];

  for (const style of backgroundStyles) {
    await prisma.backgroundStyle.upsert({
      where: { key: style.key },
      update: {
        label: style.label,
        styleType: style.styleType,
        colorValue: style.colorValue,
        colorValueEnd: style.colorValueEnd,
        textColor: style.textColor,
        isActive: true
      },
      create: {
        key: style.key,
        label: style.label,
        styleType: style.styleType,
        colorValue: style.colorValue,
        colorValueEnd: style.colorValueEnd,
        textColor: style.textColor,
        sortOrder: style.sortOrder,
        isActive: true
      },
    });
  }
}
