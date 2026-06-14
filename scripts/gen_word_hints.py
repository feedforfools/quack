#!/usr/bin/env python3
"""Generate word JSON files with hints for the quack word pool.

Each entry carries exactly 5 hints. Hints are broad single words associated
with the secret word (NOT descriptive phrases): the game hands a random
subset of them to the imposters.

Run from the repo root:
  python3 scripts/gen_word_hints.py
"""

import json
import os

# ---------------------------------------------------------------------------
# EN — Easy Words
# ---------------------------------------------------------------------------

EN_EASY = [
    {"word": "sun", "hints": ["sky", "yellow", "heat", "summer", "light"]},
    {"word": "house", "hints": ["home", "roof", "family", "garden", "walls"]},
    {"word": "water", "hints": ["drink", "ocean", "rain", "bottle", "blue"]},
    {"word": "tree", "hints": ["forest", "leaves", "wood", "green", "roots"]},
    {"word": "book", "hints": ["pages", "reading", "story", "library", "paper"]},
    {"word": "chair", "hints": ["sitting", "legs", "table", "wood", "office"]},
    {"word": "phone", "hints": ["calls", "screen", "pocket", "apps", "ringtone"]},
    {"word": "car", "hints": ["wheels", "road", "driving", "engine", "garage"]},
    {"word": "ball", "hints": ["round", "games", "bouncing", "sports", "throwing"]},
    {"word": "bed", "hints": ["sleep", "pillow", "blanket", "night", "dreams"]},
    {"word": "door", "hints": ["opening", "key", "knocking", "handle", "entrance"]},
    {"word": "shoe", "hints": ["feet", "laces", "walking", "pair", "sole"]},
    {"word": "clock", "hints": ["time", "hands", "ticking", "wall", "alarm"]},
    {"word": "milk", "hints": ["white", "cow", "breakfast", "bottle", "cereal"]},
    {"word": "rain", "hints": ["clouds", "umbrella", "wet", "storm", "drops"]},
    {"word": "fire", "hints": ["hot", "flames", "smoke", "red", "camping"]},
    {"word": "moon", "hints": ["night", "sky", "stars", "round", "astronaut"]},
    {"word": "bread", "hints": ["bakery", "flour", "toast", "slice", "butter"]},
    {"word": "key", "hints": ["lock", "door", "metal", "pocket", "ring"]},
    {"word": "hat", "hints": ["head", "sun", "cap", "fashion", "winter"]},
    {"word": "fish", "hints": ["water", "swimming", "scales", "ocean", "aquarium"]},
    {"word": "apple", "hints": ["fruit", "red", "tree", "juice", "bite"]},
    {"word": "beach", "hints": ["sand", "sea", "summer", "towel", "waves"]},
    {"word": "snow", "hints": ["winter", "white", "cold", "flakes", "snowman"]},
    {"word": "bird", "hints": ["wings", "flying", "nest", "feathers", "singing"]},
    {"word": "cake", "hints": ["birthday", "sweet", "candles", "oven", "slice"]},
    {"word": "star", "hints": ["night", "sky", "shining", "wish", "space"]},
    {"word": "garden", "hints": ["flowers", "plants", "grass", "watering", "backyard"]},
    {"word": "window", "hints": ["glass", "view", "curtains", "opening", "light"]},
    {"word": "cheese", "hints": ["yellow", "mouse", "milk", "holes", "sandwich"]},
]

# ---------------------------------------------------------------------------
# EN — Entertainment
# ---------------------------------------------------------------------------

EN_ENTERTAINMENT = [
    {"word": "superhero", "hints": ["cape", "powers", "comics", "villain", "mask"]},
    {"word": "cartoon", "hints": ["animation", "children", "drawing", "colorful", "television"]},
    {"word": "cinema", "hints": ["movies", "popcorn", "screen", "tickets", "seats"]},
    {"word": "theater", "hints": ["stage", "actors", "curtain", "play", "audience"]},
    {"word": "circus", "hints": ["clowns", "tent", "acrobats", "juggling", "elephants"]},
    {"word": "magician", "hints": ["tricks", "rabbit", "wand", "illusion", "cards"]},
    {"word": "karaoke", "hints": ["singing", "microphone", "lyrics", "bar", "friends"]},
    {"word": "sitcom", "hints": ["comedy", "episodes", "laughter", "television", "characters"]},
    {"word": "zombie", "hints": ["undead", "horror", "brains", "apocalypse", "slow"]},
    {"word": "vampire", "hints": ["fangs", "blood", "night", "garlic", "coffin"]},
    {"word": "villain", "hints": ["evil", "movie", "plan", "hero", "laughter"]},
    {"word": "sequel", "hints": ["movie", "second", "continuation", "franchise", "cinema"]},
    {"word": "trailer", "hints": ["preview", "movie", "short", "teaser", "spoiler"]},
    {"word": "podcast", "hints": ["audio", "episodes", "talking", "headphones", "interview"]},
    {"word": "musical", "hints": ["songs", "stage", "dancing", "Broadway", "singing"]},
    {"word": "comedian", "hints": ["jokes", "laughter", "stage", "microphone", "timing"]},
    {"word": "video game", "hints": ["console", "controller", "levels", "screen", "players"]},
    {"word": "board game", "hints": ["dice", "family", "table", "pieces", "rules"]},
    {"word": "puppet", "hints": ["strings", "hand", "show", "wooden", "theater"]},
    {"word": "fireworks", "hints": ["sky", "explosion", "colors", "celebration", "night"]},
    {"word": "parade", "hints": ["street", "floats", "music", "crowd", "celebration"]},
    {"word": "casino", "hints": ["gambling", "cards", "chips", "roulette", "luck"]},
    {"word": "talent show", "hints": ["stage", "judges", "votes", "singing", "audience"]},
    {"word": "red carpet", "hints": ["celebrities", "premiere", "photographers", "fashion", "Hollywood"]},
    {"word": "award", "hints": ["trophy", "winner", "ceremony", "speech", "gold"]},
    {"word": "soap opera", "hints": ["drama", "television", "episodes", "romance", "endless"]},
    {"word": "reality show", "hints": ["cameras", "contestants", "drama", "television", "elimination"]},
    {"word": "escape room", "hints": ["puzzles", "locked", "team", "clues", "timer"]},
    {"word": "amusement park", "hints": ["rides", "rollercoaster", "queues", "fun", "tickets"]},
    {"word": "horror movie", "hints": ["scary", "screams", "darkness", "monster", "popcorn"]},
]

# ---------------------------------------------------------------------------
# EN — Everyday Things
# ---------------------------------------------------------------------------

EN_EVERYDAY = [
    {"word": "umbrella", "hints": ["rain", "folding", "handle", "wet", "storm"]},
    {"word": "toothbrush", "hints": ["bathroom", "teeth", "morning", "toothpaste", "bristles"]},
    {"word": "wallet", "hints": ["money", "pocket", "cards", "leather", "cash"]},
    {"word": "backpack", "hints": ["shoulders", "zipper", "books", "hiking", "straps"]},
    {"word": "mirror", "hints": ["reflection", "bathroom", "glass", "selfie", "wall"]},
    {"word": "pillow", "hints": ["bed", "soft", "sleep", "feathers", "head"]},
    {"word": "towel", "hints": ["bathroom", "drying", "beach", "soft", "shower"]},
    {"word": "scissors", "hints": ["cutting", "paper", "sharp", "blades", "craft"]},
    {"word": "candle", "hints": ["flame", "wax", "birthday", "romantic", "scented"]},
    {"word": "soap", "hints": ["washing", "bubbles", "bathroom", "clean", "hands"]},
    {"word": "sponge", "hints": ["kitchen", "dishes", "absorbing", "yellow", "cleaning"]},
    {"word": "broom", "hints": ["sweeping", "floor", "dust", "handle", "witch"]},
    {"word": "ladder", "hints": ["climbing", "steps", "wall", "painting", "tall"]},
    {"word": "hammer", "hints": ["nails", "tool", "wood", "heavy", "hitting"]},
    {"word": "flashlight", "hints": ["batteries", "darkness", "beam", "camping", "emergency"]},
    {"word": "charger", "hints": ["cable", "battery", "phone", "plug", "electricity"]},
    {"word": "headphones", "hints": ["music", "ears", "wireless", "listening", "silence"]},
    {"word": "sunglasses", "hints": ["summer", "eyes", "fashion", "beach", "dark"]},
    {"word": "suitcase", "hints": ["travel", "packing", "wheels", "airport", "clothes"]},
    {"word": "blanket", "hints": ["warm", "sofa", "winter", "soft", "cozy"]},
    {"word": "remote", "hints": ["television", "buttons", "sofa", "channels", "batteries"]},
    {"word": "fridge", "hints": ["kitchen", "cold", "food", "magnets", "leftovers"]},
    {"word": "microwave", "hints": ["kitchen", "heating", "beeping", "leftovers", "minutes"]},
    {"word": "washing machine", "hints": ["laundry", "clothes", "spinning", "detergent", "drum"]},
    {"word": "vacuum", "hints": ["cleaning", "carpet", "dust", "loud", "cordless"]},
    {"word": "kettle", "hints": ["tea", "boiling", "water", "whistle", "kitchen"]},
    {"word": "toaster", "hints": ["bread", "breakfast", "crispy", "kitchen", "crumbs"]},
    {"word": "alarm clock", "hints": ["morning", "ringing", "snooze", "waking", "bedside"]},
    {"word": "trash can", "hints": ["garbage", "lid", "kitchen", "smell", "bags"]},
    {"word": "band-aid", "hints": ["cut", "skin", "sticky", "wound", "pharmacy"]},
]

# ---------------------------------------------------------------------------
# EN — Animals & Nature
# ---------------------------------------------------------------------------

EN_ANIMALS = [
    {"word": "lion", "hints": ["savanna", "mane", "roar", "king", "pride"]},
    {"word": "elephant", "hints": ["trunk", "gray", "huge", "Africa", "memory"]},
    {"word": "penguin", "hints": ["ice", "waddling", "tuxedo", "Antarctica", "colony"]},
    {"word": "dolphin", "hints": ["ocean", "intelligent", "jumping", "clicks", "friendly"]},
    {"word": "shark", "hints": ["teeth", "ocean", "fin", "predator", "fear"]},
    {"word": "eagle", "hints": ["wings", "prey", "mountains", "talons", "symbol"]},
    {"word": "owl", "hints": ["night", "wisdom", "hooting", "forest", "eyes"]},
    {"word": "wolf", "hints": ["pack", "howling", "moon", "forest", "gray"]},
    {"word": "fox", "hints": ["cunning", "orange", "tail", "forest", "sly"]},
    {"word": "bear", "hints": ["honey", "hibernation", "forest", "strong", "fur"]},
    {"word": "butterfly", "hints": ["wings", "caterpillar", "flowers", "colorful", "fluttering"]},
    {"word": "bee", "hints": ["honey", "hive", "buzzing", "flowers", "sting"]},
    {"word": "spider", "hints": ["web", "eight", "legs", "insects", "corner"]},
    {"word": "snake", "hints": ["slithering", "venom", "scales", "hissing", "long"]},
    {"word": "frog", "hints": ["pond", "jumping", "green", "croaking", "tadpole"]},
    {"word": "horse", "hints": ["riding", "gallop", "mane", "stable", "saddle"]},
    {"word": "rabbit", "hints": ["ears", "hopping", "carrots", "fluffy", "fast"]},
    {"word": "turtle", "hints": ["shell", "slow", "beach", "ancient", "swimming"]},
    {"word": "octopus", "hints": ["tentacles", "ink", "ocean", "eight", "clever"]},
    {"word": "kangaroo", "hints": ["Australia", "pouch", "jumping", "boxing", "joey"]},
    {"word": "panda", "hints": ["bamboo", "China", "lazy", "rare", "cuddly"]},
    {"word": "giraffe", "hints": ["neck", "tall", "spots", "Africa", "leaves"]},
    {"word": "volcano", "hints": ["lava", "eruption", "mountain", "ash", "crater"]},
    {"word": "rainbow", "hints": ["colors", "rain", "sky", "arc", "gold"]},
    {"word": "waterfall", "hints": ["river", "cliff", "splash", "roaring", "mist"]},
    {"word": "desert", "hints": ["sand", "camels", "hot", "dunes", "cactus"]},
    {"word": "jungle", "hints": ["trees", "monkeys", "dense", "tropical", "vines"]},
    {"word": "glacier", "hints": ["ice", "slow", "mountains", "melting", "blue"]},
    {"word": "thunderstorm", "hints": ["lightning", "rain", "loud", "clouds", "flash"]},
    {"word": "coral", "hints": ["ocean", "colorful", "fish", "reef", "fragile"]},
]

# ---------------------------------------------------------------------------
# EN — Sports
# ---------------------------------------------------------------------------

EN_SPORTS = [
    {"word": "soccer", "hints": ["ball", "goal", "field", "eleven", "referee"]},
    {"word": "basketball", "hints": ["hoop", "dribbling", "court", "tall", "orange"]},
    {"word": "tennis", "hints": ["racket", "net", "court", "serve", "yellow"]},
    {"word": "volleyball", "hints": ["net", "beach", "spike", "team", "hands"]},
    {"word": "swimming", "hints": ["pool", "water", "strokes", "goggles", "laps"]},
    {"word": "marathon", "hints": ["running", "distance", "medal", "sweat", "finish"]},
    {"word": "boxing", "hints": ["gloves", "ring", "punch", "rounds", "knockout"]},
    {"word": "skiing", "hints": ["snow", "mountains", "slopes", "poles", "winter"]},
    {"word": "surfing", "hints": ["waves", "board", "ocean", "balance", "wetsuit"]},
    {"word": "cycling", "hints": ["bicycle", "helmet", "pedals", "race", "road"]},
    {"word": "golf", "hints": ["club", "holes", "green", "swing", "caddie"]},
    {"word": "rugby", "hints": ["oval", "tackle", "scrum", "team", "mud"]},
    {"word": "baseball", "hints": ["bat", "pitcher", "bases", "glove", "stadium"]},
    {"word": "hockey", "hints": ["ice", "stick", "puck", "skates", "goal"]},
    {"word": "gymnastics", "hints": ["flexibility", "routine", "mat", "flips", "balance"]},
    {"word": "climbing", "hints": ["rope", "wall", "harness", "mountain", "grip"]},
    {"word": "skateboard", "hints": ["wheels", "tricks", "ramp", "street", "balance"]},
    {"word": "yoga", "hints": ["mat", "stretching", "breathing", "poses", "calm"]},
    {"word": "karate", "hints": ["belt", "kicks", "dojo", "discipline", "white"]},
    {"word": "fencing", "hints": ["sword", "mask", "lunge", "duel", "white"]},
    {"word": "archery", "hints": ["bow", "arrow", "target", "aiming", "bullseye"]},
    {"word": "bowling", "hints": ["pins", "ball", "lane", "strike", "shoes"]},
    {"word": "darts", "hints": ["board", "throwing", "pub", "bullseye", "points"]},
    {"word": "chess", "hints": ["board", "pieces", "king", "strategy", "checkmate"]},
    {"word": "table tennis", "hints": ["paddle", "ball", "table", "net", "fast"]},
    {"word": "racing", "hints": ["cars", "speed", "circuit", "helmet", "pitstop"]},
    {"word": "referee", "hints": ["whistle", "rules", "cards", "field", "decisions"]},
    {"word": "stadium", "hints": ["crowd", "seats", "field", "cheering", "lights"]},
    {"word": "trophy", "hints": ["winner", "gold", "cup", "ceremony", "shelf"]},
    {"word": "olympics", "hints": ["games", "medals", "rings", "athletes", "torch"]},
]

# ---------------------------------------------------------------------------
# EN — School
# ---------------------------------------------------------------------------

EN_SCHOOL = [
    {"word": "teacher", "hints": ["classroom", "lessons", "blackboard", "students", "homework"]},
    {"word": "homework", "hints": ["evening", "exercises", "deadline", "notebook", "boring"]},
    {"word": "blackboard", "hints": ["chalk", "classroom", "writing", "eraser", "green"]},
    {"word": "recess", "hints": ["break", "playground", "bell", "friends", "games"]},
    {"word": "exam", "hints": ["questions", "stress", "grades", "silence", "studying"]},
    {"word": "pencil", "hints": ["writing", "sharpener", "eraser", "wood", "case"]},
    {"word": "eraser", "hints": ["mistakes", "rubber", "pencil", "pink", "smudge"]},
    {"word": "notebook", "hints": ["pages", "notes", "lines", "spiral", "writing"]},
    {"word": "ruler", "hints": ["measuring", "straight", "centimeters", "plastic", "lines"]},
    {"word": "glue", "hints": ["sticky", "craft", "paper", "bottle", "fingers"]},
    {"word": "highlighter", "hints": ["yellow", "marking", "text", "fluorescent", "studying"]},
    {"word": "calculator", "hints": ["math", "numbers", "buttons", "exam", "screen"]},
    {"word": "microscope", "hints": ["science", "lens", "tiny", "laboratory", "slides"]},
    {"word": "globe", "hints": ["geography", "spinning", "countries", "classroom", "round"]},
    {"word": "dictionary", "hints": ["words", "definitions", "thick", "alphabetical", "language"]},
    {"word": "library", "hints": ["books", "silence", "borrowing", "shelves", "studying"]},
    {"word": "cafeteria", "hints": ["lunch", "trays", "noise", "queue", "friends"]},
    {"word": "principal", "hints": ["office", "school", "authority", "announcements", "trouble"]},
    {"word": "detention", "hints": ["punishment", "boredom", "classroom", "rules", "silence"]},
    {"word": "diploma", "hints": ["graduation", "certificate", "ceremony", "proud", "rolled"]},
    {"word": "graduation", "hints": ["cap", "gown", "ceremony", "diploma", "celebration"]},
    {"word": "classroom", "hints": ["desks", "students", "teacher", "board", "lessons"]},
    {"word": "desk", "hints": ["chair", "classroom", "drawer", "wooden", "sitting"]},
    {"word": "bell", "hints": ["ringing", "break", "school", "sound", "classes"]},
    {"word": "grade", "hints": ["marks", "report", "teacher", "numbers", "parents"]},
    {"word": "field trip", "hints": ["bus", "museum", "excitement", "permission", "class"]},
    {"word": "uniform", "hints": ["clothes", "school", "identical", "tie", "rules"]},
    {"word": "chalk", "hints": ["blackboard", "white", "dust", "writing", "teacher"]},
    {"word": "locker", "hints": ["hallway", "code", "books", "metal", "storage"]},
    {"word": "laboratory", "hints": ["experiments", "goggles", "chemicals", "science", "safety"]},
]

# ---------------------------------------------------------------------------
# EN — Celebrities
# ---------------------------------------------------------------------------

EN_CELEBRITIES = [
    {"word": "Lionel Messi", "hints": ["football", "Argentina", "goals", "Barcelona", "champion"]},
    {"word": "Cristiano Ronaldo", "hints": ["football", "Portugal", "goals", "muscles", "celebration"]},
    {"word": "Beyoncé", "hints": ["singer", "queen", "pop", "diva", "Texas"]},
    {"word": "Taylor Swift", "hints": ["singer", "eras", "pop", "fans", "blonde"]},
    {"word": "Rihanna", "hints": ["singer", "makeup", "Barbados", "umbrella", "fashion"]},
    {"word": "Elon Musk", "hints": ["billionaire", "rockets", "Tesla", "Twitter", "Mars"]},
    {"word": "Barack Obama", "hints": ["president", "America", "speech", "hope", "Hawaii"]},
    {"word": "Queen Elizabeth", "hints": ["royalty", "England", "crown", "corgis", "reign"]},
    {"word": "Michael Jackson", "hints": ["pop", "moonwalk", "glove", "thriller", "king"]},
    {"word": "Madonna", "hints": ["pop", "queen", "eighties", "blonde", "provocative"]},
    {"word": "Leonardo DiCaprio", "hints": ["actor", "Titanic", "Oscar", "environment", "Hollywood"]},
    {"word": "Brad Pitt", "hints": ["actor", "handsome", "Hollywood", "blonde", "fight"]},
    {"word": "Angelina Jolie", "hints": ["actress", "lips", "adoption", "action", "humanitarian"]},
    {"word": "Tom Cruise", "hints": ["actor", "stunts", "mission", "pilot", "smile"]},
    {"word": "Will Smith", "hints": ["actor", "rap", "slap", "prince", "Hollywood"]},
    {"word": "Dwayne Johnson", "hints": ["rock", "muscles", "wrestling", "bald", "action"]},
    {"word": "Keanu Reeves", "hints": ["actor", "matrix", "kindness", "action", "motorcycle"]},
    {"word": "Lady Gaga", "hints": ["singer", "outfits", "pop", "piano", "extravagant"]},
    {"word": "Ariana Grande", "hints": ["singer", "ponytail", "pop", "petite", "whistle"]},
    {"word": "Justin Bieber", "hints": ["singer", "Canada", "baby", "pop", "tattoos"]},
    {"word": "Shakira", "hints": ["singer", "hips", "Colombia", "dancing", "worldcup"]},
    {"word": "Adele", "hints": ["singer", "British", "hello", "ballads", "voice"]},
    {"word": "Ed Sheeran", "hints": ["singer", "redhead", "guitar", "British", "shape"]},
    {"word": "Harry Styles", "hints": ["singer", "British", "fashion", "boyband", "curls"]},
    {"word": "Emma Watson", "hints": ["actress", "Hermione", "British", "activist", "magic"]},
    {"word": "Johnny Depp", "hints": ["actor", "pirate", "trial", "eccentric", "hats"]},
    {"word": "Serena Williams", "hints": ["tennis", "champion", "power", "sister", "legend"]},
    {"word": "Usain Bolt", "hints": ["sprinter", "Jamaica", "fastest", "lightning", "gold"]},
    {"word": "Roger Federer", "hints": ["tennis", "Swiss", "elegant", "champion", "racket"]},
    {"word": "Mr. Bean", "hints": ["comedy", "silent", "British", "teddy", "grimaces"]},
]

# ---------------------------------------------------------------------------
# EN — Spicy (love life, kept PG-13)
# ---------------------------------------------------------------------------

EN_SPICY = [
    {"word": "kiss", "hints": ["lips", "romantic", "first", "cheek", "french"]},
    {"word": "crush", "hints": ["secret", "butterflies", "school", "blushing", "feelings"]},
    {"word": "flirting", "hints": ["winking", "compliments", "bar", "smile", "charming"]},
    {"word": "date", "hints": ["dinner", "nervous", "restaurant", "romantic", "candles"]},
    {"word": "honeymoon", "hints": ["wedding", "travel", "romantic", "suite", "couple"]},
    {"word": "love letter", "hints": ["paper", "romantic", "secret", "perfume", "handwritten"]},
    {"word": "blind date", "hints": ["stranger", "restaurant", "surprise", "awkward", "setup"]},
    {"word": "ex", "hints": ["past", "breakup", "drama", "jealousy", "memories"]},
    {"word": "breakup", "hints": ["tears", "drama", "single", "message", "heartbroken"]},
    {"word": "jealousy", "hints": ["green", "possessive", "suspicion", "drama", "partner"]},
    {"word": "soulmate", "hints": ["destiny", "forever", "perfect", "connection", "love"]},
    {"word": "wedding", "hints": ["dress", "rings", "cake", "church", "party"]},
    {"word": "proposal", "hints": ["ring", "knee", "surprise", "yes", "romantic"]},
    {"word": "anniversary", "hints": ["celebration", "couple", "gifts", "dinner", "forgetting"]},
    {"word": "valentine", "hints": ["february", "roses", "cards", "romantic", "chocolate"]},
    {"word": "hickey", "hints": ["neck", "mark", "embarrassing", "scarf", "passion"]},
    {"word": "one-night stand", "hints": ["stranger", "morning", "awkward", "regret", "party"]},
    {"word": "friendzone", "hints": ["friends", "rejection", "hope", "awkward", "forever"]},
    {"word": "dating app", "hints": ["swiping", "profile", "match", "chat", "photos"]},
    {"word": "pickup line", "hints": ["bar", "cheesy", "flirting", "smile", "original"]},
    {"word": "seduction", "hints": ["charm", "slow", "eyes", "perfume", "tension"]},
    {"word": "lingerie", "hints": ["lace", "bedroom", "gift", "red", "secret"]},
    {"word": "skinny dipping", "hints": ["naked", "lake", "night", "dare", "cold"]},
    {"word": "love triangle", "hints": ["drama", "three", "secret", "jealousy", "choice"]},
    {"word": "secret admirer", "hints": ["anonymous", "letters", "flowers", "mystery", "crush"]},
    {"word": "slow dance", "hints": ["prom", "close", "music", "hands", "romantic"]},
    {"word": "cuddling", "hints": ["sofa", "warm", "blanket", "hug", "cozy"]},
    {"word": "butterflies", "hints": ["stomach", "nervous", "crush", "feeling", "fluttering"]},
    {"word": "heartbreak", "hints": ["tears", "pain", "songs", "chocolate", "time"]},
    {"word": "celebrity crush", "hints": ["famous", "poster", "fantasy", "teenage", "dreamy"]},
]

# ---------------------------------------------------------------------------
# EN — Food & Drinks
# ---------------------------------------------------------------------------

EN_FOOD = [
    {"word": "pizza", "hints": ["Italy", "cheese", "oven", "slices", "delivery"]},
    {"word": "sushi", "hints": ["Japan", "rice", "fish", "chopsticks", "soy"]},
    {"word": "burger", "hints": ["meat", "buns", "fries", "American", "ketchup"]},
    {"word": "pasta", "hints": ["Italy", "sauce", "shapes", "boiling", "fork"]},
    {"word": "chocolate", "hints": ["sweet", "cocoa", "dark", "gift", "melting"]},
    {"word": "ice cream", "hints": ["cold", "cone", "summer", "flavors", "scoop"]},
    {"word": "coffee", "hints": ["morning", "caffeine", "espresso", "cup", "awake"]},
    {"word": "tea", "hints": ["hot", "leaves", "British", "cup", "calming"]},
    {"word": "wine", "hints": ["grapes", "glass", "red", "cellar", "toast"]},
    {"word": "beer", "hints": ["foam", "pub", "cold", "bottle", "friends"]},
    {"word": "cocktail", "hints": ["bar", "colorful", "umbrella", "alcohol", "shaker"]},
    {"word": "smoothie", "hints": ["fruit", "blender", "healthy", "breakfast", "straw"]},
    {"word": "pancake", "hints": ["breakfast", "syrup", "flat", "stack", "flipping"]},
    {"word": "croissant", "hints": ["France", "buttery", "breakfast", "flaky", "bakery"]},
    {"word": "sandwich", "hints": ["bread", "lunch", "filling", "quick", "picnic"]},
    {"word": "salad", "hints": ["healthy", "vegetables", "dressing", "green", "bowl"]},
    {"word": "soup", "hints": ["hot", "bowl", "spoon", "winter", "broth"]},
    {"word": "steak", "hints": ["meat", "grill", "rare", "knife", "juicy"]},
    {"word": "taco", "hints": ["Mexico", "shell", "spicy", "street", "filling"]},
    {"word": "ramen", "hints": ["Japan", "noodles", "broth", "bowl", "slurping"]},
    {"word": "curry", "hints": ["India", "spicy", "rice", "sauce", "yellow"]},
    {"word": "lasagna", "hints": ["layers", "Italy", "oven", "cheese", "Sunday"]},
    {"word": "tiramisu", "hints": ["coffee", "Italy", "dessert", "mascarpone", "cocoa"]},
    {"word": "donut", "hints": ["ring", "glaze", "sweet", "fried", "sprinkles"]},
    {"word": "popcorn", "hints": ["cinema", "corn", "butter", "bucket", "popping"]},
    {"word": "honey", "hints": ["bees", "sweet", "golden", "sticky", "jar"]},
    {"word": "lemonade", "hints": ["summer", "sour", "refreshing", "yellow", "pitcher"]},
    {"word": "champagne", "hints": ["bubbles", "celebration", "cork", "French", "toast"]},
    {"word": "espresso", "hints": ["Italy", "small", "strong", "bar", "cup"]},
    {"word": "barbecue", "hints": ["grill", "smoke", "summer", "meat", "garden"]},
]

# ---------------------------------------------------------------------------
# EN — Professions
# ---------------------------------------------------------------------------

EN_PROFESSIONS = [
    {"word": "doctor", "hints": ["hospital", "stethoscope", "patients", "white", "prescription"]},
    {"word": "firefighter", "hints": ["flames", "truck", "helmet", "hose", "brave"]},
    {"word": "police officer", "hints": ["badge", "uniform", "siren", "handcuffs", "law"]},
    {"word": "chef", "hints": ["kitchen", "restaurant", "hat", "recipes", "knives"]},
    {"word": "pilot", "hints": ["airplane", "cockpit", "uniform", "sky", "captain"]},
    {"word": "nurse", "hints": ["hospital", "care", "injections", "scrubs", "patients"]},
    {"word": "lawyer", "hints": ["court", "suits", "arguments", "judge", "contracts"]},
    {"word": "judge", "hints": ["court", "gavel", "robe", "sentence", "justice"]},
    {"word": "plumber", "hints": ["pipes", "leaks", "wrench", "bathroom", "overalls"]},
    {"word": "electrician", "hints": ["wires", "voltage", "tools", "lights", "sparks"]},
    {"word": "carpenter", "hints": ["wood", "hammer", "sawdust", "furniture", "workshop"]},
    {"word": "farmer", "hints": ["fields", "tractor", "harvest", "animals", "dawn"]},
    {"word": "fisherman", "hints": ["boat", "nets", "sea", "patience", "catch"]},
    {"word": "astronaut", "hints": ["space", "helmet", "rocket", "floating", "NASA"]},
    {"word": "scientist", "hints": ["laboratory", "experiments", "research", "microscope", "discovery"]},
    {"word": "architect", "hints": ["buildings", "blueprints", "design", "drawings", "models"]},
    {"word": "photographer", "hints": ["camera", "lens", "shooting", "lights", "editing"]},
    {"word": "journalist", "hints": ["news", "interviews", "deadline", "articles", "microphone"]},
    {"word": "actor", "hints": ["stage", "camera", "script", "fame", "roles"]},
    {"word": "musician", "hints": ["instruments", "concerts", "studio", "melody", "stage"]},
    {"word": "dentist", "hints": ["teeth", "drill", "chair", "fear", "smile"]},
    {"word": "veterinarian", "hints": ["animals", "clinic", "pets", "care", "injections"]},
    {"word": "hairdresser", "hints": ["scissors", "salon", "styling", "mirrors", "gossip"]},
    {"word": "mechanic", "hints": ["cars", "garage", "oil", "tools", "engine"]},
    {"word": "waiter", "hints": ["restaurant", "tray", "orders", "tips", "apron"]},
    {"word": "barista", "hints": ["coffee", "espresso", "foam", "counter", "morning"]},
    {"word": "programmer", "hints": ["computer", "code", "bugs", "keyboard", "coffee"]},
    {"word": "designer", "hints": ["creativity", "fashion", "sketches", "style", "trends"]},
    {"word": "translator", "hints": ["languages", "words", "documents", "bilingual", "meetings"]},
    {"word": "surgeon", "hints": ["operating", "precision", "scalpel", "mask", "hospital"]},
]

# ---------------------------------------------------------------------------
# EN — Internet Culture
# ---------------------------------------------------------------------------

EN_INTERNET = [
    {"word": "meme", "hints": ["funny", "viral", "image", "sharing", "internet"]},
    {"word": "hashtag", "hints": ["social", "trending", "symbol", "Twitter", "posts"]},
    {"word": "selfie", "hints": ["camera", "front", "pose", "filter", "sharing"]},
    {"word": "influencer", "hints": ["followers", "sponsorship", "Instagram", "content", "famous"]},
    {"word": "livestream", "hints": ["live", "viewers", "chat", "gaming", "camera"]},
    {"word": "viral", "hints": ["spreading", "video", "millions", "internet", "overnight"]},
    {"word": "emoji", "hints": ["faces", "messages", "yellow", "expressions", "keyboard"]},
    {"word": "filter", "hints": ["photo", "beauty", "Instagram", "dog", "smoothing"]},
    {"word": "troll", "hints": ["comments", "provoking", "anonymous", "internet", "feeding"]},
    {"word": "spam", "hints": ["emails", "unwanted", "folder", "advertising", "annoying"]},
    {"word": "wifi", "hints": ["internet", "password", "router", "signal", "free"]},
    {"word": "password", "hints": ["secret", "login", "forgotten", "security", "asterisks"]},
    {"word": "streaming", "hints": ["Netflix", "watching", "online", "binge", "series"]},
    {"word": "youtuber", "hints": ["videos", "channel", "subscribers", "camera", "vlogs"]},
    {"word": "TikTok", "hints": ["dances", "short", "videos", "trends", "scrolling"]},
    {"word": "unboxing", "hints": ["package", "camera", "reaction", "new", "reveal"]},
    {"word": "clickbait", "hints": ["title", "curiosity", "misleading", "shocking", "thumbnail"]},
    {"word": "screenshot", "hints": ["capture", "proof", "phone", "sharing", "receipts"]},
    {"word": "notification", "hints": ["ping", "phone", "badge", "distraction", "endless"]},
    {"word": "algorithm", "hints": ["feed", "recommendations", "mysterious", "content", "addiction"]},
    {"word": "avatar", "hints": ["profile", "picture", "digital", "identity", "character"]},
    {"word": "GIF", "hints": ["animated", "loop", "reaction", "funny", "messages"]},
    {"word": "blog", "hints": ["writing", "posts", "personal", "internet", "readers"]},
    {"word": "vlog", "hints": ["camera", "daily", "youtube", "life", "talking"]},
    {"word": "follower", "hints": ["social", "count", "Instagram", "fans", "growing"]},
    {"word": "like", "hints": ["thumbs", "heart", "button", "approval", "counting"]},
    {"word": "comment section", "hints": ["opinions", "arguments", "scrolling", "toxic", "replies"]},
    {"word": "download", "hints": ["files", "internet", "progress", "waiting", "saving"]},
    {"word": "gamer", "hints": ["console", "headset", "streaming", "night", "energy"]},
    {"word": "crypto", "hints": ["bitcoin", "digital", "investment", "volatile", "wallet"]},
]

# ---------------------------------------------------------------------------
# EN — Retro
# ---------------------------------------------------------------------------

EN_RETRO = [
    {"word": "cassette", "hints": ["tape", "music", "rewinding", "pencil", "walkman"]},
    {"word": "vinyl", "hints": ["record", "turntable", "grooves", "collector", "crackle"]},
    {"word": "walkman", "hints": ["music", "portable", "headphones", "cassette", "eighties"]},
    {"word": "typewriter", "hints": ["keys", "ink", "paper", "clacking", "vintage"]},
    {"word": "floppy disk", "hints": ["computer", "saving", "square", "obsolete", "data"]},
    {"word": "VHS", "hints": ["tape", "rewinding", "rental", "movies", "player"]},
    {"word": "arcade", "hints": ["coins", "joystick", "games", "neon", "highscore"]},
    {"word": "jukebox", "hints": ["diner", "coins", "songs", "glowing", "fifties"]},
    {"word": "polaroid", "hints": ["photo", "instant", "shaking", "white", "frame"]},
    {"word": "rotary phone", "hints": ["dial", "cord", "slow", "vintage", "ringing"]},
    {"word": "pager", "hints": ["beeper", "message", "doctor", "belt", "nineties"]},
    {"word": "Game Boy", "hints": ["Nintendo", "portable", "Tetris", "gray", "batteries"]},
    {"word": "tamagotchi", "hints": ["pet", "digital", "feeding", "beeping", "nineties"]},
    {"word": "Rubik's cube", "hints": ["puzzle", "colors", "twisting", "solving", "frustration"]},
    {"word": "disco", "hints": ["dancing", "ball", "seventies", "lights", "fever"]},
    {"word": "mixtape", "hints": ["songs", "cassette", "gift", "romantic", "curated"]},
    {"word": "drive-in", "hints": ["movies", "cars", "screen", "outdoor", "speakers"]},
    {"word": "encyclopedia", "hints": ["volumes", "knowledge", "shelf", "heavy", "alphabetical"]},
    {"word": "fax", "hints": ["machine", "paper", "office", "beeping", "obsolete"]},
    {"word": "dial-up", "hints": ["internet", "modem", "noise", "slow", "busy"]},
    {"word": "roller skates", "hints": ["wheels", "rink", "seventies", "falling", "disco"]},
    {"word": "lava lamp", "hints": ["glowing", "wax", "hypnotic", "bedroom", "psychedelic"]},
    {"word": "boombox", "hints": ["shoulder", "music", "batteries", "loud", "breakdance"]},
    {"word": "phone booth", "hints": ["coins", "glass", "street", "Superman", "obsolete"]},
    {"word": "telegram", "hints": ["message", "dots", "urgent", "stop", "wire"]},
    {"word": "gramophone", "hints": ["horn", "records", "antique", "crank", "music"]},
    {"word": "slide projector", "hints": ["photos", "clicking", "family", "wall", "vacation"]},
    {"word": "milkman", "hints": ["bottles", "delivery", "morning", "doorstep", "vintage"]},
    {"word": "antenna", "hints": ["roof", "signal", "channels", "adjusting", "static"]},
    {"word": "record store", "hints": ["vinyl", "browsing", "music", "posters", "weekends"]},
]

# ---------------------------------------------------------------------------
# EN — Fantasy
# ---------------------------------------------------------------------------

EN_FANTASY = [
    {"word": "dragon", "hints": ["fire", "wings", "treasure", "scales", "knight"]},
    {"word": "wizard", "hints": ["magic", "wand", "beard", "spells", "hat"]},
    {"word": "unicorn", "hints": ["horn", "rainbow", "white", "magical", "pure"]},
    {"word": "fairy", "hints": ["wings", "tiny", "dust", "forest", "wish"]},
    {"word": "elf", "hints": ["ears", "forest", "archer", "immortal", "graceful"]},
    {"word": "dwarf", "hints": ["beard", "mining", "axe", "short", "mountain"]},
    {"word": "goblin", "hints": ["green", "mischief", "treasure", "ugly", "cave"]},
    {"word": "troll", "hints": ["bridge", "big", "club", "stone", "smelly"]},
    {"word": "mermaid", "hints": ["tail", "ocean", "singing", "scales", "sailors"]},
    {"word": "giant", "hints": ["huge", "beanstalk", "footsteps", "clouds", "strength"]},
    {"word": "witch", "hints": ["broom", "cauldron", "spells", "hat", "cat"]},
    {"word": "werewolf", "hints": ["moon", "transformation", "howling", "silver", "curse"]},
    {"word": "ghost", "hints": ["haunting", "white", "transparent", "castle", "chains"]},
    {"word": "phoenix", "hints": ["fire", "rebirth", "ashes", "immortal", "wings"]},
    {"word": "griffin", "hints": ["eagle", "lion", "wings", "majestic", "guardian"]},
    {"word": "castle", "hints": ["towers", "king", "moat", "stone", "drawbridge"]},
    {"word": "knight", "hints": ["armor", "sword", "horse", "quest", "shield"]},
    {"word": "princess", "hints": ["crown", "tower", "royal", "dress", "rescue"]},
    {"word": "king", "hints": ["throne", "crown", "kingdom", "ruling", "royal"]},
    {"word": "quest", "hints": ["journey", "hero", "mission", "adventure", "reward"]},
    {"word": "sword", "hints": ["blade", "knight", "sharp", "legendary", "duel"]},
    {"word": "potion", "hints": ["bottle", "magic", "brewing", "ingredients", "bubbling"]},
    {"word": "spell", "hints": ["magic", "words", "wand", "casting", "curse"]},
    {"word": "curse", "hints": ["evil", "witch", "breaking", "doomed", "spell"]},
    {"word": "treasure", "hints": ["gold", "chest", "map", "pirates", "buried"]},
    {"word": "prophecy", "hints": ["future", "chosen", "ancient", "destiny", "scroll"]},
    {"word": "portal", "hints": ["doorway", "dimension", "glowing", "travel", "magic"]},
    {"word": "kingdom", "hints": ["realm", "king", "castle", "land", "throne"]},
    {"word": "genie", "hints": ["lamp", "wishes", "three", "smoke", "freed"]},
    {"word": "pegasus", "hints": ["horse", "wings", "flying", "white", "mythology"]},
]

# ---------------------------------------------------------------------------
# EN — Science & Space
# ---------------------------------------------------------------------------

EN_SCIENCE = [
    {"word": "rocket", "hints": ["launch", "space", "countdown", "fuel", "NASA"]},
    {"word": "planet", "hints": ["orbit", "solar", "round", "space", "system"]},
    {"word": "galaxy", "hints": ["stars", "spiral", "vast", "universe", "milky"]},
    {"word": "black hole", "hints": ["gravity", "space", "light", "mysterious", "massive"]},
    {"word": "telescope", "hints": ["stars", "lens", "observatory", "distant", "astronomer"]},
    {"word": "atom", "hints": ["tiny", "nucleus", "physics", "particles", "matter"]},
    {"word": "gravity", "hints": ["falling", "Newton", "apple", "force", "Earth"]},
    {"word": "DNA", "hints": ["genes", "helix", "biology", "code", "inheritance"]},
    {"word": "robot", "hints": ["machine", "artificial", "metal", "programmed", "future"]},
    {"word": "satellite", "hints": ["orbit", "signal", "space", "dish", "GPS"]},
    {"word": "asteroid", "hints": ["rock", "space", "impact", "belt", "dinosaurs"]},
    {"word": "comet", "hints": ["tail", "ice", "sky", "orbit", "bright"]},
    {"word": "eclipse", "hints": ["sun", "moon", "shadow", "rare", "glasses"]},
    {"word": "meteor", "hints": ["shooting", "sky", "burning", "wish", "night"]},
    {"word": "spacesuit", "hints": ["astronaut", "white", "helmet", "oxygen", "bulky"]},
    {"word": "alien", "hints": ["UFO", "green", "space", "abduction", "unknown"]},
    {"word": "UFO", "hints": ["flying", "saucer", "mystery", "lights", "sighting"]},
    {"word": "Mars", "hints": ["red", "planet", "rover", "colony", "dust"]},
    {"word": "moon landing", "hints": ["Apollo", "flag", "astronauts", "footprint", "television"]},
    {"word": "space station", "hints": ["orbit", "astronauts", "modules", "floating", "international"]},
    {"word": "vaccine", "hints": ["needle", "immunity", "doctor", "protection", "laboratory"]},
    {"word": "bacteria", "hints": ["microscopic", "germs", "infection", "antibiotics", "everywhere"]},
    {"word": "evolution", "hints": ["Darwin", "species", "adaptation", "gradual", "fossils"]},
    {"word": "dinosaur", "hints": ["extinct", "fossil", "huge", "Jurassic", "bones"]},
    {"word": "fossil", "hints": ["ancient", "stone", "bones", "digging", "museum"]},
    {"word": "electricity", "hints": ["current", "wires", "shock", "power", "Tesla"]},
    {"word": "magnet", "hints": ["attraction", "poles", "metal", "fridge", "field"]},
    {"word": "laser", "hints": ["beam", "red", "precise", "light", "pointer"]},
    {"word": "experiment", "hints": ["laboratory", "hypothesis", "test", "results", "goggles"]},
    {"word": "chemistry", "hints": ["elements", "reactions", "laboratory", "formulas", "explosions"]},
]

# ---------------------------------------------------------------------------
# EN — Music
# ---------------------------------------------------------------------------

EN_MUSIC = [
    {"word": "guitar", "hints": ["strings", "strumming", "rock", "acoustic", "chords"]},
    {"word": "piano", "hints": ["keys", "black", "white", "classical", "pedals"]},
    {"word": "drums", "hints": ["sticks", "rhythm", "loud", "kit", "beat"]},
    {"word": "violin", "hints": ["bow", "strings", "classical", "orchestra", "chin"]},
    {"word": "microphone", "hints": ["singing", "stage", "voice", "stand", "karaoke"]},
    {"word": "concert", "hints": ["stage", "crowd", "tickets", "live", "lights"]},
    {"word": "orchestra", "hints": ["conductor", "instruments", "classical", "symphony", "formal"]},
    {"word": "DJ", "hints": ["turntables", "club", "mixing", "headphones", "party"]},
    {"word": "rapper", "hints": ["rhymes", "beat", "microphone", "flow", "street"]},
    {"word": "opera", "hints": ["singing", "dramatic", "Italian", "soprano", "theater"]},
    {"word": "jazz", "hints": ["saxophone", "improvisation", "smooth", "club", "swing"]},
    {"word": "rock", "hints": ["guitar", "loud", "band", "leather", "concert"]},
    {"word": "choir", "hints": ["voices", "church", "harmony", "singing", "robes"]},
    {"word": "saxophone", "hints": ["jazz", "brass", "curved", "smooth", "solo"]},
    {"word": "trumpet", "hints": ["brass", "loud", "jazz", "valves", "fanfare"]},
    {"word": "flute", "hints": ["wind", "silver", "classical", "blowing", "delicate"]},
    {"word": "harp", "hints": ["strings", "angel", "elegant", "plucking", "golden"]},
    {"word": "accordion", "hints": ["squeezing", "folk", "buttons", "Paris", "polka"]},
    {"word": "bagpipes", "hints": ["Scotland", "kilt", "loud", "drone", "traditional"]},
    {"word": "ukulele", "hints": ["small", "Hawaii", "strings", "cheerful", "beach"]},
    {"word": "melody", "hints": ["tune", "humming", "catchy", "notes", "song"]},
    {"word": "lyrics", "hints": ["words", "song", "memorizing", "meaning", "singing"]},
    {"word": "album", "hints": ["songs", "cover", "artist", "release", "tracks"]},
    {"word": "band", "hints": ["members", "instruments", "tour", "garage", "fame"]},
    {"word": "festival", "hints": ["music", "camping", "stages", "summer", "crowds"]},
    {"word": "playlist", "hints": ["songs", "curated", "mood", "shuffle", "Spotify"]},
    {"word": "autotune", "hints": ["voice", "studio", "pitch", "robotic", "pop"]},
    {"word": "encore", "hints": ["concert", "more", "applause", "final", "crowd"]},
    {"word": "conductor", "hints": ["orchestra", "baton", "waving", "tempo", "tailcoat"]},
    {"word": "beatbox", "hints": ["mouth", "rhythm", "sounds", "street", "microphone"]},
]

# ---------------------------------------------------------------------------
# EN — Around the World
# ---------------------------------------------------------------------------

EN_WORLD = [
    {"word": "Paris", "hints": ["Eiffel", "France", "romance", "croissants", "fashion"]},
    {"word": "Rome", "hints": ["Colosseum", "Italy", "ancient", "pasta", "Vatican"]},
    {"word": "London", "hints": ["England", "rain", "queen", "bus", "tea"]},
    {"word": "New York", "hints": ["skyscrapers", "taxi", "Broadway", "apple", "Manhattan"]},
    {"word": "Tokyo", "hints": ["Japan", "neon", "sushi", "crowded", "technology"]},
    {"word": "Venice", "hints": ["canals", "gondola", "Italy", "masks", "bridges"]},
    {"word": "Egypt", "hints": ["pyramids", "pharaoh", "desert", "Nile", "sphinx"]},
    {"word": "Sahara", "hints": ["desert", "sand", "camels", "vast", "Africa"]},
    {"word": "Amazon", "hints": ["rainforest", "river", "Brazil", "jungle", "biodiversity"]},
    {"word": "Everest", "hints": ["mountain", "highest", "climbing", "Nepal", "snow"]},
    {"word": "Hawaii", "hints": ["islands", "surfing", "volcano", "flowers", "paradise"]},
    {"word": "Australia", "hints": ["kangaroo", "outback", "Sydney", "reef", "koala"]},
    {"word": "Brazil", "hints": ["carnival", "football", "samba", "beaches", "Rio"]},
    {"word": "India", "hints": ["spices", "Bollywood", "cows", "colors", "yoga"]},
    {"word": "China", "hints": ["wall", "dragon", "rice", "panda", "ancient"]},
    {"word": "Iceland", "hints": ["geysers", "ice", "volcano", "northern", "cold"]},
    {"word": "Greece", "hints": ["islands", "mythology", "ruins", "feta", "blue"]},
    {"word": "Switzerland", "hints": ["Alps", "chocolate", "watches", "neutral", "banks"]},
    {"word": "Norway", "hints": ["fjords", "vikings", "snow", "northern", "salmon"]},
    {"word": "Morocco", "hints": ["markets", "spices", "desert", "mint", "mosaic"]},
    {"word": "Dubai", "hints": ["skyscrapers", "luxury", "desert", "gold", "mall"]},
    {"word": "Las Vegas", "hints": ["casino", "lights", "desert", "weddings", "gambling"]},
    {"word": "Great Wall", "hints": ["China", "long", "ancient", "bricks", "watchtowers"]},
    {"word": "Eiffel Tower", "hints": ["Paris", "iron", "lights", "tall", "romantic"]},
    {"word": "Colosseum", "hints": ["Rome", "gladiators", "arena", "ancient", "ruins"]},
    {"word": "Statue of Liberty", "hints": ["America", "torch", "green", "island", "gift"]},
    {"word": "Niagara", "hints": ["waterfalls", "border", "mist", "boat", "honeymoon"]},
    {"word": "Antarctica", "hints": ["penguins", "ice", "cold", "research", "remote"]},
    {"word": "Caribbean", "hints": ["islands", "pirates", "beaches", "rum", "turquoise"]},
    {"word": "safari", "hints": ["Africa", "animals", "jeep", "binoculars", "savanna"]},
]

# ---------------------------------------------------------------------------
# IT — Parole facili
# ---------------------------------------------------------------------------

IT_EASY = [
    {"word": "sole", "hints": ["cielo", "giallo", "caldo", "estate", "luce"]},
    {"word": "casa", "hints": ["tetto", "famiglia", "giardino", "mura", "chiavi"]},
    {"word": "acqua", "hints": ["bere", "mare", "pioggia", "bottiglia", "blu"]},
    {"word": "albero", "hints": ["bosco", "foglie", "legno", "verde", "radici"]},
    {"word": "libro", "hints": ["pagine", "lettura", "storia", "biblioteca", "carta"]},
    {"word": "sedia", "hints": ["seduta", "gambe", "tavolo", "legno", "ufficio"]},
    {"word": "telefono", "hints": ["chiamate", "schermo", "tasca", "app", "suoneria"]},
    {"word": "macchina", "hints": ["ruote", "strada", "guida", "motore", "garage"]},
    {"word": "palla", "hints": ["rotonda", "giochi", "rimbalzo", "sport", "lancio"]},
    {"word": "letto", "hints": ["sonno", "cuscino", "coperta", "notte", "sogni"]},
    {"word": "porta", "hints": ["apertura", "chiave", "bussare", "maniglia", "ingresso"]},
    {"word": "scarpa", "hints": ["piedi", "lacci", "camminare", "paio", "suola"]},
    {"word": "orologio", "hints": ["tempo", "lancette", "ticchettio", "polso", "sveglia"]},
    {"word": "latte", "hints": ["bianco", "mucca", "colazione", "bottiglia", "cereali"]},
    {"word": "pioggia", "hints": ["nuvole", "ombrello", "bagnato", "temporale", "gocce"]},
    {"word": "fuoco", "hints": ["caldo", "fiamme", "fumo", "rosso", "campeggio"]},
    {"word": "luna", "hints": ["notte", "cielo", "stelle", "piena", "astronauta"]},
    {"word": "pane", "hints": ["forno", "farina", "fetta", "burro", "fresco"]},
    {"word": "chiave", "hints": ["serratura", "porta", "metallo", "tasca", "mazzo"]},
    {"word": "cappello", "hints": ["testa", "sole", "visiera", "moda", "inverno"]},
    {"word": "pesce", "hints": ["acqua", "nuotare", "squame", "mare", "acquario"]},
    {"word": "mela", "hints": ["frutta", "rossa", "albero", "succo", "morso"]},
    {"word": "spiaggia", "hints": ["sabbia", "mare", "estate", "telo", "onde"]},
    {"word": "neve", "hints": ["inverno", "bianca", "freddo", "fiocchi", "pupazzo"]},
    {"word": "uccello", "hints": ["ali", "volare", "nido", "piume", "canto"]},
    {"word": "torta", "hints": ["compleanno", "dolce", "candeline", "forno", "fetta"]},
    {"word": "stella", "hints": ["notte", "cielo", "brillare", "desiderio", "spazio"]},
    {"word": "giardino", "hints": ["fiori", "piante", "erba", "annaffiare", "cortile"]},
    {"word": "finestra", "hints": ["vetro", "vista", "tende", "aprire", "luce"]},
    {"word": "formaggio", "hints": ["giallo", "topo", "latte", "buchi", "panino"]},
]

# ---------------------------------------------------------------------------
# IT — Intrattenimento
# ---------------------------------------------------------------------------

IT_ENTERTAINMENT = [
    {"word": "supereroe", "hints": ["mantello", "poteri", "fumetti", "cattivo", "maschera"]},
    {"word": "cartone animato", "hints": ["animazione", "bambini", "disegni", "colorato", "televisione"]},
    {"word": "cinema", "hints": ["film", "popcorn", "schermo", "biglietti", "poltrone"]},
    {"word": "teatro", "hints": ["palco", "attori", "sipario", "spettacolo", "pubblico"]},
    {"word": "circo", "hints": ["pagliacci", "tendone", "acrobati", "giocoleria", "elefanti"]},
    {"word": "mago", "hints": ["trucchi", "coniglio", "bacchetta", "illusione", "carte"]},
    {"word": "karaoke", "hints": ["cantare", "microfono", "testi", "bar", "amici"]},
    {"word": "sitcom", "hints": ["commedia", "episodi", "risate", "televisione", "personaggi"]},
    {"word": "zombie", "hints": ["nonmorti", "horror", "cervelli", "apocalisse", "lenti"]},
    {"word": "vampiro", "hints": ["canini", "sangue", "notte", "aglio", "bara"]},
    {"word": "cattivo", "hints": ["malvagio", "film", "piano", "eroe", "risata"]},
    {"word": "sequel", "hints": ["film", "secondo", "continuazione", "saga", "cinema"]},
    {"word": "trailer", "hints": ["anteprima", "film", "breve", "teaser", "spoiler"]},
    {"word": "podcast", "hints": ["audio", "episodi", "parlare", "cuffie", "intervista"]},
    {"word": "musical", "hints": ["canzoni", "palco", "ballo", "Broadway", "cantare"]},
    {"word": "comico", "hints": ["battute", "risate", "palco", "microfono", "tempi"]},
    {"word": "videogioco", "hints": ["console", "controller", "livelli", "schermo", "giocatori"]},
    {"word": "gioco da tavolo", "hints": ["dadi", "famiglia", "tavolo", "pedine", "regole"]},
    {"word": "burattino", "hints": ["fili", "mano", "spettacolo", "legno", "teatro"]},
    {"word": "fuochi d'artificio", "hints": ["cielo", "esplosione", "colori", "festa", "notte"]},
    {"word": "sfilata", "hints": ["strada", "carri", "musica", "folla", "festa"]},
    {"word": "casinò", "hints": ["gioco", "carte", "fiches", "roulette", "fortuna"]},
    {"word": "talent show", "hints": ["palco", "giudici", "voti", "cantare", "pubblico"]},
    {"word": "red carpet", "hints": ["celebrità", "anteprima", "fotografi", "moda", "Hollywood"]},
    {"word": "premio", "hints": ["trofeo", "vincitore", "cerimonia", "discorso", "oro"]},
    {"word": "telenovela", "hints": ["dramma", "televisione", "puntate", "amore", "infinita"]},
    {"word": "reality show", "hints": ["telecamere", "concorrenti", "dramma", "televisione", "eliminazione"]},
    {"word": "escape room", "hints": ["enigmi", "chiusi", "squadra", "indizi", "tempo"]},
    {"word": "luna park", "hints": ["giostre", "montagne russe", "code", "divertimento", "biglietti"]},
    {"word": "film horror", "hints": ["paura", "urla", "buio", "mostro", "popcorn"]},
]

# ---------------------------------------------------------------------------
# IT — Oggetti quotidiani
# ---------------------------------------------------------------------------

IT_EVERYDAY = [
    {"word": "ombrello", "hints": ["pioggia", "pieghevole", "manico", "bagnato", "temporale"]},
    {"word": "spazzolino", "hints": ["bagno", "denti", "mattina", "dentifricio", "setole"]},
    {"word": "portafoglio", "hints": ["soldi", "tasca", "carte", "pelle", "contanti"]},
    {"word": "zaino", "hints": ["spalle", "cerniera", "libri", "trekking", "spallacci"]},
    {"word": "specchio", "hints": ["riflesso", "bagno", "vetro", "selfie", "parete"]},
    {"word": "cuscino", "hints": ["letto", "morbido", "sonno", "piume", "testa"]},
    {"word": "asciugamano", "hints": ["bagno", "asciugare", "spiaggia", "morbido", "doccia"]},
    {"word": "forbici", "hints": ["tagliare", "carta", "affilate", "lame", "lavoretti"]},
    {"word": "candela", "hints": ["fiamma", "cera", "compleanno", "romantica", "profumata"]},
    {"word": "sapone", "hints": ["lavare", "bolle", "bagno", "pulito", "mani"]},
    {"word": "spugna", "hints": ["cucina", "piatti", "assorbente", "gialla", "pulizie"]},
    {"word": "scopa", "hints": ["spazzare", "pavimento", "polvere", "manico", "strega"]},
    {"word": "scala", "hints": ["salire", "gradini", "muro", "imbiancare", "alta"]},
    {"word": "martello", "hints": ["chiodi", "attrezzo", "legno", "pesante", "colpi"]},
    {"word": "torcia", "hints": ["batterie", "buio", "fascio", "campeggio", "emergenza"]},
    {"word": "caricabatterie", "hints": ["cavo", "batteria", "telefono", "presa", "elettricità"]},
    {"word": "cuffie", "hints": ["musica", "orecchie", "wireless", "ascoltare", "silenzio"]},
    {"word": "occhiali da sole", "hints": ["estate", "occhi", "moda", "spiaggia", "scuri"]},
    {"word": "valigia", "hints": ["viaggio", "bagaglio", "rotelle", "aeroporto", "vestiti"]},
    {"word": "coperta", "hints": ["calda", "divano", "inverno", "morbida", "comoda"]},
    {"word": "telecomando", "hints": ["televisione", "tasti", "divano", "canali", "batterie"]},
    {"word": "frigorifero", "hints": ["cucina", "freddo", "cibo", "calamite", "avanzi"]},
    {"word": "microonde", "hints": ["cucina", "riscaldare", "bip", "avanzi", "minuti"]},
    {"word": "lavatrice", "hints": ["bucato", "vestiti", "centrifuga", "detersivo", "oblò"]},
    {"word": "aspirapolvere", "hints": ["pulizie", "tappeto", "polvere", "rumoroso", "sacchetto"]},
    {"word": "bollitore", "hints": ["tè", "bollire", "acqua", "fischio", "cucina"]},
    {"word": "tostapane", "hints": ["pane", "colazione", "croccante", "cucina", "briciole"]},
    {"word": "sveglia", "hints": ["mattina", "suonare", "posticipa", "alzarsi", "comodino"]},
    {"word": "pattumiera", "hints": ["spazzatura", "coperchio", "cucina", "odore", "sacchetti"]},
    {"word": "cerotto", "hints": ["taglio", "pelle", "adesivo", "ferita", "farmacia"]},
]

# ---------------------------------------------------------------------------
# IT — Animali e natura
# ---------------------------------------------------------------------------

IT_ANIMALS = [
    {"word": "leone", "hints": ["savana", "criniera", "ruggito", "re", "branco"]},
    {"word": "elefante", "hints": ["proboscide", "grigio", "enorme", "Africa", "memoria"]},
    {"word": "pinguino", "hints": ["ghiaccio", "dondolare", "frac", "Antartide", "colonia"]},
    {"word": "delfino", "hints": ["mare", "intelligente", "salti", "fischi", "amichevole"]},
    {"word": "squalo", "hints": ["denti", "oceano", "pinna", "predatore", "paura"]},
    {"word": "aquila", "hints": ["ali", "preda", "montagne", "artigli", "simbolo"]},
    {"word": "gufo", "hints": ["notte", "saggezza", "verso", "bosco", "occhi"]},
    {"word": "lupo", "hints": ["branco", "ululato", "luna", "bosco", "grigio"]},
    {"word": "volpe", "hints": ["astuta", "arancione", "coda", "bosco", "furba"]},
    {"word": "orso", "hints": ["miele", "letargo", "bosco", "forte", "pelliccia"]},
    {"word": "farfalla", "hints": ["ali", "bruco", "fiori", "colorata", "svolazzare"]},
    {"word": "ape", "hints": ["miele", "alveare", "ronzio", "fiori", "pungiglione"]},
    {"word": "ragno", "hints": ["ragnatela", "otto", "zampe", "insetti", "angolo"]},
    {"word": "serpente", "hints": ["strisciare", "veleno", "squame", "sibilo", "lungo"]},
    {"word": "rana", "hints": ["stagno", "saltare", "verde", "gracidare", "girino"]},
    {"word": "cavallo", "hints": ["cavalcare", "galoppo", "criniera", "stalla", "sella"]},
    {"word": "coniglio", "hints": ["orecchie", "saltellare", "carote", "morbido", "veloce"]},
    {"word": "tartaruga", "hints": ["guscio", "lenta", "spiaggia", "antica", "nuotare"]},
    {"word": "polpo", "hints": ["tentacoli", "inchiostro", "mare", "otto", "furbo"]},
    {"word": "canguro", "hints": ["Australia", "marsupio", "salti", "boxe", "cucciolo"]},
    {"word": "panda", "hints": ["bambù", "Cina", "pigro", "raro", "coccolone"]},
    {"word": "giraffa", "hints": ["collo", "alta", "macchie", "Africa", "foglie"]},
    {"word": "vulcano", "hints": ["lava", "eruzione", "montagna", "cenere", "cratere"]},
    {"word": "arcobaleno", "hints": ["colori", "pioggia", "cielo", "arco", "oro"]},
    {"word": "cascata", "hints": ["fiume", "salto", "spruzzi", "fragore", "nebbiolina"]},
    {"word": "deserto", "hints": ["sabbia", "cammelli", "caldo", "dune", "cactus"]},
    {"word": "giungla", "hints": ["alberi", "scimmie", "fitta", "tropicale", "liane"]},
    {"word": "ghiacciaio", "hints": ["ghiaccio", "lento", "montagne", "scioglimento", "blu"]},
    {"word": "temporale", "hints": ["fulmini", "pioggia", "tuoni", "nuvole", "lampi"]},
    {"word": "corallo", "hints": ["mare", "colorato", "pesci", "barriera", "fragile"]},
]

# ---------------------------------------------------------------------------
# IT — Sport
# ---------------------------------------------------------------------------

IT_SPORTS = [
    {"word": "calcio", "hints": ["pallone", "gol", "campo", "undici", "arbitro"]},
    {"word": "basket", "hints": ["canestro", "palleggio", "campo", "alti", "arancione"]},
    {"word": "tennis", "hints": ["racchetta", "rete", "campo", "servizio", "gialla"]},
    {"word": "pallavolo", "hints": ["rete", "spiaggia", "schiacciata", "squadra", "mani"]},
    {"word": "nuoto", "hints": ["piscina", "acqua", "stili", "occhialini", "vasche"]},
    {"word": "maratona", "hints": ["corsa", "distanza", "medaglia", "sudore", "traguardo"]},
    {"word": "boxe", "hints": ["guantoni", "ring", "pugno", "riprese", "knockout"]},
    {"word": "sci", "hints": ["neve", "montagne", "piste", "bastoncini", "inverno"]},
    {"word": "surf", "hints": ["onde", "tavola", "oceano", "equilibrio", "muta"]},
    {"word": "ciclismo", "hints": ["bicicletta", "casco", "pedali", "gara", "strada"]},
    {"word": "golf", "hints": ["mazza", "buche", "prato", "swing", "caddie"]},
    {"word": "rugby", "hints": ["ovale", "placcaggio", "mischia", "squadra", "fango"]},
    {"word": "baseball", "hints": ["mazza", "lanciatore", "basi", "guantone", "stadio"]},
    {"word": "hockey", "hints": ["ghiaccio", "bastone", "disco", "pattini", "porta"]},
    {"word": "ginnastica", "hints": ["flessibilità", "esercizio", "tappeto", "capriole", "equilibrio"]},
    {"word": "arrampicata", "hints": ["corda", "parete", "imbrago", "montagna", "presa"]},
    {"word": "skateboard", "hints": ["ruote", "trick", "rampa", "strada", "equilibrio"]},
    {"word": "yoga", "hints": ["tappetino", "stretching", "respiro", "posizioni", "calma"]},
    {"word": "karate", "hints": ["cintura", "calci", "dojo", "disciplina", "bianco"]},
    {"word": "scherma", "hints": ["spada", "maschera", "affondo", "duello", "bianco"]},
    {"word": "tiro con l'arco", "hints": ["arco", "freccia", "bersaglio", "mira", "centro"]},
    {"word": "bowling", "hints": ["birilli", "boccia", "pista", "strike", "scarpe"]},
    {"word": "freccette", "hints": ["bersaglio", "lancio", "pub", "centro", "punti"]},
    {"word": "scacchi", "hints": ["scacchiera", "pezzi", "re", "strategia", "scaccomatto"]},
    {"word": "ping pong", "hints": ["racchetta", "pallina", "tavolo", "rete", "veloce"]},
    {"word": "automobilismo", "hints": ["auto", "velocità", "circuito", "casco", "box"]},
    {"word": "arbitro", "hints": ["fischietto", "regole", "cartellini", "campo", "decisioni"]},
    {"word": "stadio", "hints": ["folla", "posti", "campo", "cori", "riflettori"]},
    {"word": "trofeo", "hints": ["vincitore", "oro", "coppa", "cerimonia", "bacheca"]},
    {"word": "olimpiadi", "hints": ["giochi", "medaglie", "cerchi", "atleti", "fiaccola"]},
]

# ---------------------------------------------------------------------------
# IT — Scuola
# ---------------------------------------------------------------------------

IT_SCHOOL = [
    {"word": "maestra", "hints": ["classe", "lezioni", "lavagna", "alunni", "compiti"]},
    {"word": "compiti", "hints": ["pomeriggio", "esercizi", "scadenza", "quaderno", "noiosi"]},
    {"word": "lavagna", "hints": ["gesso", "classe", "scrivere", "cancellino", "verde"]},
    {"word": "ricreazione", "hints": ["pausa", "cortile", "campanella", "amici", "merenda"]},
    {"word": "verifica", "hints": ["domande", "ansia", "voti", "silenzio", "studiare"]},
    {"word": "matita", "hints": ["scrivere", "temperino", "gomma", "legno", "astuccio"]},
    {"word": "gomma", "hints": ["errori", "cancellare", "matita", "rosa", "sbavature"]},
    {"word": "quaderno", "hints": ["pagine", "appunti", "righe", "spirale", "scrivere"]},
    {"word": "righello", "hints": ["misurare", "dritto", "centimetri", "plastica", "linee"]},
    {"word": "colla", "hints": ["appiccicosa", "lavoretti", "carta", "stick", "dita"]},
    {"word": "evidenziatore", "hints": ["giallo", "sottolineare", "testo", "fluorescente", "studiare"]},
    {"word": "calcolatrice", "hints": ["matematica", "numeri", "tasti", "verifica", "schermo"]},
    {"word": "microscopio", "hints": ["scienze", "lente", "minuscolo", "laboratorio", "vetrini"]},
    {"word": "mappamondo", "hints": ["geografia", "girare", "paesi", "classe", "rotondo"]},
    {"word": "dizionario", "hints": ["parole", "definizioni", "spesso", "alfabetico", "lingua"]},
    {"word": "biblioteca", "hints": ["libri", "silenzio", "prestito", "scaffali", "studiare"]},
    {"word": "mensa", "hints": ["pranzo", "vassoi", "rumore", "fila", "compagni"]},
    {"word": "preside", "hints": ["ufficio", "scuola", "autorità", "circolari", "guai"]},
    {"word": "nota", "hints": ["punizione", "registro", "genitori", "firma", "guai"]},
    {"word": "diploma", "hints": ["maturità", "certificato", "cerimonia", "orgoglio", "pergamena"]},
    {"word": "interrogazione", "hints": ["cattedra", "domande", "ansia", "voto", "ripassare"]},
    {"word": "classe", "hints": ["banchi", "alunni", "maestra", "lavagna", "lezioni"]},
    {"word": "banco", "hints": ["sedia", "classe", "compagno", "legno", "scritte"]},
    {"word": "campanella", "hints": ["suono", "pausa", "scuola", "uscita", "ore"]},
    {"word": "pagella", "hints": ["voti", "fine", "genitori", "numeri", "promosso"]},
    {"word": "gita", "hints": ["pullman", "museo", "entusiasmo", "permesso", "classe"]},
    {"word": "grembiule", "hints": ["vestito", "elementari", "uguale", "fiocco", "regole"]},
    {"word": "gesso", "hints": ["lavagna", "bianco", "polvere", "scrivere", "maestra"]},
    {"word": "diario", "hints": ["compiti", "date", "firme", "adesivi", "zaino"]},
    {"word": "laboratorio", "hints": ["esperimenti", "occhiali", "sostanze", "scienze", "sicurezza"]},
]

# ---------------------------------------------------------------------------
# IT — Celebrità
# ---------------------------------------------------------------------------

IT_CELEBRITIES = [
    {"word": "Lionel Messi", "hints": ["calcio", "Argentina", "gol", "Barcellona", "campione"]},
    {"word": "Cristiano Ronaldo", "hints": ["calcio", "Portogallo", "gol", "muscoli", "esultanza"]},
    {"word": "Beyoncé", "hints": ["cantante", "regina", "pop", "diva", "Texas"]},
    {"word": "Taylor Swift", "hints": ["cantante", "eras", "pop", "fan", "bionda"]},
    {"word": "Elon Musk", "hints": ["miliardario", "razzi", "Tesla", "Twitter", "Marte"]},
    {"word": "Barack Obama", "hints": ["presidente", "America", "discorsi", "speranza", "Hawaii"]},
    {"word": "Michael Jackson", "hints": ["pop", "moonwalk", "guanto", "thriller", "re"]},
    {"word": "Madonna", "hints": ["pop", "regina", "ottanta", "bionda", "provocante"]},
    {"word": "Leonardo DiCaprio", "hints": ["attore", "Titanic", "Oscar", "ambiente", "Hollywood"]},
    {"word": "Brad Pitt", "hints": ["attore", "affascinante", "Hollywood", "biondo", "fight"]},
    {"word": "Tom Cruise", "hints": ["attore", "acrobazie", "missione", "pilota", "sorriso"]},
    {"word": "Will Smith", "hints": ["attore", "rap", "schiaffo", "principe", "Hollywood"]},
    {"word": "Dwayne Johnson", "hints": ["roccia", "muscoli", "wrestling", "calvo", "azione"]},
    {"word": "Lady Gaga", "hints": ["cantante", "outfit", "pop", "piano", "eccentrica"]},
    {"word": "Shakira", "hints": ["cantante", "fianchi", "Colombia", "ballo", "mondiali"]},
    {"word": "Adele", "hints": ["cantante", "britannica", "hello", "ballate", "voce"]},
    {"word": "Ed Sheeran", "hints": ["cantante", "rosso", "chitarra", "britannico", "shape"]},
    {"word": "Emma Watson", "hints": ["attrice", "Hermione", "britannica", "attivista", "magia"]},
    {"word": "Johnny Depp", "hints": ["attore", "pirata", "processo", "eccentrico", "cappelli"]},
    {"word": "Usain Bolt", "hints": ["velocista", "Giamaica", "record", "fulmine", "oro"]},
    {"word": "Roger Federer", "hints": ["tennis", "svizzero", "elegante", "campione", "racchetta"]},
    {"word": "Mr. Bean", "hints": ["comico", "muto", "britannico", "orsacchiotto", "smorfie"]},
    {"word": "Vasco Rossi", "hints": ["rock", "Zocca", "concerti", "vita", "spericolata"]},
    {"word": "Laura Pausini", "hints": ["cantante", "Sanremo", "solitudine", "Grammy", "romagnola"]},
    {"word": "Jovanotti", "hints": ["cantante", "rap", "estate", "bici", "ottimismo"]},
    {"word": "Fiorello", "hints": ["showman", "siciliano", "radio", "imitazioni", "mattina"]},
    {"word": "Checco Zalone", "hints": ["comico", "pugliese", "film", "record", "irriverente"]},
    {"word": "Chiara Ferragni", "hints": ["influencer", "moda", "Instagram", "imprenditrice", "bionda"]},
    {"word": "Francesco Totti", "hints": ["calcio", "Roma", "capitano", "cucchiaio", "bandiera"]},
    {"word": "Måneskin", "hints": ["rock", "band", "Eurovision", "Sanremo", "Damiano"]},
]

# ---------------------------------------------------------------------------
# IT — Piccante (vita sentimentale, restando PG-13)
# ---------------------------------------------------------------------------

IT_SPICY = [
    {"word": "bacio", "hints": ["labbra", "romantico", "primo", "guancia", "francese"]},
    {"word": "cotta", "hints": ["segreta", "farfalle", "scuola", "arrossire", "sentimenti"]},
    {"word": "flirt", "hints": ["occhiolino", "complimenti", "bar", "sorriso", "fascino"]},
    {"word": "appuntamento", "hints": ["cena", "nervosismo", "ristorante", "romantico", "candele"]},
    {"word": "luna di miele", "hints": ["matrimonio", "viaggio", "romantica", "suite", "coppia"]},
    {"word": "lettera d'amore", "hints": ["carta", "romantica", "segreta", "profumo", "calligrafia"]},
    {"word": "appuntamento al buio", "hints": ["sconosciuto", "ristorante", "sorpresa", "imbarazzo", "combinato"]},
    {"word": "ex", "hints": ["passato", "rottura", "dramma", "gelosia", "ricordi"]},
    {"word": "rottura", "hints": ["lacrime", "dramma", "single", "messaggio", "cuore"]},
    {"word": "gelosia", "hints": ["verde", "possessivo", "sospetti", "dramma", "partner"]},
    {"word": "anima gemella", "hints": ["destino", "per sempre", "perfetta", "legame", "amore"]},
    {"word": "matrimonio", "hints": ["abito", "fedi", "torta", "chiesa", "festa"]},
    {"word": "proposta", "hints": ["anello", "ginocchio", "sorpresa", "sì", "romantica"]},
    {"word": "anniversario", "hints": ["festeggiare", "coppia", "regali", "cena", "dimenticare"]},
    {"word": "San Valentino", "hints": ["febbraio", "rose", "biglietti", "romantico", "cioccolatini"]},
    {"word": "succhiotto", "hints": ["collo", "segno", "imbarazzo", "sciarpa", "passione"]},
    {"word": "avventura di una notte", "hints": ["sconosciuto", "mattina", "imbarazzo", "rimpianto", "festa"]},
    {"word": "friendzone", "hints": ["amici", "rifiuto", "speranza", "imbarazzo", "per sempre"]},
    {"word": "app di incontri", "hints": ["swipe", "profilo", "match", "chat", "foto"]},
    {"word": "frase da rimorchio", "hints": ["bar", "scontata", "flirt", "sorriso", "originale"]},
    {"word": "seduzione", "hints": ["fascino", "lentezza", "sguardi", "profumo", "tensione"]},
    {"word": "lingerie", "hints": ["pizzo", "camera", "regalo", "rosso", "segreto"]},
    {"word": "bagno di mezzanotte", "hints": ["nudi", "lago", "notte", "sfida", "freddo"]},
    {"word": "triangolo amoroso", "hints": ["dramma", "tre", "segreto", "gelosia", "scelta"]},
    {"word": "ammiratore segreto", "hints": ["anonimo", "lettere", "fiori", "mistero", "cotta"]},
    {"word": "ballo lento", "hints": ["festa", "vicini", "musica", "mani", "romantico"]},
    {"word": "coccole", "hints": ["divano", "calore", "coperta", "abbraccio", "tenerezza"]},
    {"word": "farfalle nello stomaco", "hints": ["nervosismo", "cotta", "sensazione", "battito", "emozione"]},
    {"word": "cuore spezzato", "hints": ["lacrime", "dolore", "canzoni", "cioccolato", "tempo"]},
    {"word": "cotta per una star", "hints": ["famoso", "poster", "fantasia", "adolescenza", "sogni"]},
]

# ---------------------------------------------------------------------------
# IT — Cibo e bevande
# ---------------------------------------------------------------------------

IT_FOOD = [
    {"word": "pizza", "hints": ["Italia", "formaggio", "forno", "fette", "consegna"]},
    {"word": "sushi", "hints": ["Giappone", "riso", "pesce", "bacchette", "soia"]},
    {"word": "hamburger", "hints": ["carne", "panino", "patatine", "americano", "ketchup"]},
    {"word": "pasta", "hints": ["Italia", "sugo", "formati", "bollire", "forchetta"]},
    {"word": "cioccolato", "hints": ["dolce", "cacao", "fondente", "regalo", "sciogliersi"]},
    {"word": "gelato", "hints": ["freddo", "cono", "estate", "gusti", "pallina"]},
    {"word": "caffè", "hints": ["mattina", "caffeina", "espresso", "tazzina", "sveglia"]},
    {"word": "tè", "hints": ["caldo", "foglie", "inglese", "tazza", "rilassante"]},
    {"word": "vino", "hints": ["uva", "calice", "rosso", "cantina", "brindisi"]},
    {"word": "birra", "hints": ["schiuma", "pub", "fredda", "bottiglia", "amici"]},
    {"word": "cocktail", "hints": ["bar", "colorato", "ombrellino", "alcol", "shaker"]},
    {"word": "frullato", "hints": ["frutta", "frullatore", "sano", "colazione", "cannuccia"]},
    {"word": "pancake", "hints": ["colazione", "sciroppo", "piatti", "pila", "padella"]},
    {"word": "cornetto", "hints": ["bar", "colazione", "sfoglia", "crema", "cappuccino"]},
    {"word": "panino", "hints": ["pane", "pranzo", "farcito", "veloce", "picnic"]},
    {"word": "insalata", "hints": ["sana", "verdure", "condimento", "verde", "ciotola"]},
    {"word": "zuppa", "hints": ["calda", "ciotola", "cucchiaio", "inverno", "brodo"]},
    {"word": "bistecca", "hints": ["carne", "griglia", "sangue", "coltello", "succosa"]},
    {"word": "taco", "hints": ["Messico", "guscio", "piccante", "strada", "ripieno"]},
    {"word": "ramen", "hints": ["Giappone", "noodles", "brodo", "ciotola", "rumore"]},
    {"word": "curry", "hints": ["India", "piccante", "riso", "salsa", "giallo"]},
    {"word": "lasagna", "hints": ["strati", "Italia", "forno", "besciamella", "domenica"]},
    {"word": "tiramisù", "hints": ["caffè", "Italia", "dolce", "mascarpone", "cacao"]},
    {"word": "ciambella", "hints": ["anello", "glassa", "dolce", "fritta", "zuccherini"]},
    {"word": "popcorn", "hints": ["cinema", "mais", "burro", "secchiello", "scoppiettare"]},
    {"word": "miele", "hints": ["api", "dolce", "dorato", "appiccicoso", "barattolo"]},
    {"word": "limonata", "hints": ["estate", "aspra", "dissetante", "gialla", "caraffa"]},
    {"word": "spumante", "hints": ["bollicine", "festa", "tappo", "brindisi", "capodanno"]},
    {"word": "espresso", "hints": ["Italia", "piccolo", "forte", "bar", "tazzina"]},
    {"word": "grigliata", "hints": ["brace", "fumo", "estate", "carne", "giardino"]},
]

# ---------------------------------------------------------------------------
# IT — Professioni
# ---------------------------------------------------------------------------

IT_PROFESSIONS = [
    {"word": "dottore", "hints": ["ospedale", "stetoscopio", "pazienti", "camice", "ricetta"]},
    {"word": "pompiere", "hints": ["fiamme", "camion", "casco", "idrante", "coraggio"]},
    {"word": "poliziotto", "hints": ["distintivo", "divisa", "sirena", "manette", "legge"]},
    {"word": "cuoco", "hints": ["cucina", "ristorante", "cappello", "ricette", "coltelli"]},
    {"word": "pilota", "hints": ["aereo", "cabina", "divisa", "cielo", "comandante"]},
    {"word": "infermiera", "hints": ["ospedale", "cura", "iniezioni", "camice", "pazienti"]},
    {"word": "avvocato", "hints": ["tribunale", "completi", "arringa", "giudice", "contratti"]},
    {"word": "giudice", "hints": ["tribunale", "martelletto", "toga", "sentenza", "giustizia"]},
    {"word": "idraulico", "hints": ["tubi", "perdite", "chiave", "bagno", "tuta"]},
    {"word": "elettricista", "hints": ["fili", "corrente", "attrezzi", "luci", "scintille"]},
    {"word": "falegname", "hints": ["legno", "martello", "segatura", "mobili", "bottega"]},
    {"word": "contadino", "hints": ["campi", "trattore", "raccolto", "animali", "alba"]},
    {"word": "pescatore", "hints": ["barca", "reti", "mare", "pazienza", "pescato"]},
    {"word": "astronauta", "hints": ["spazio", "casco", "razzo", "fluttuare", "NASA"]},
    {"word": "scienziato", "hints": ["laboratorio", "esperimenti", "ricerca", "microscopio", "scoperta"]},
    {"word": "architetto", "hints": ["edifici", "progetti", "design", "disegni", "modellini"]},
    {"word": "fotografo", "hints": ["macchina", "obiettivo", "scatti", "luci", "ritocco"]},
    {"word": "giornalista", "hints": ["notizie", "interviste", "scadenza", "articoli", "microfono"]},
    {"word": "attore", "hints": ["palco", "telecamera", "copione", "fama", "ruoli"]},
    {"word": "musicista", "hints": ["strumenti", "concerti", "studio", "melodia", "palco"]},
    {"word": "dentista", "hints": ["denti", "trapano", "poltrona", "paura", "sorriso"]},
    {"word": "veterinario", "hints": ["animali", "clinica", "cuccioli", "cura", "iniezioni"]},
    {"word": "parrucchiere", "hints": ["forbici", "salone", "piega", "specchi", "chiacchiere"]},
    {"word": "meccanico", "hints": ["auto", "officina", "olio", "attrezzi", "motore"]},
    {"word": "cameriere", "hints": ["ristorante", "vassoio", "ordini", "mance", "grembiule"]},
    {"word": "barista", "hints": ["caffè", "espresso", "schiuma", "bancone", "mattina"]},
    {"word": "programmatore", "hints": ["computer", "codice", "bug", "tastiera", "caffè"]},
    {"word": "stilista", "hints": ["creatività", "moda", "bozzetti", "stile", "tendenze"]},
    {"word": "traduttore", "hints": ["lingue", "parole", "documenti", "bilingue", "riunioni"]},
    {"word": "chirurgo", "hints": ["operazione", "precisione", "bisturi", "mascherina", "ospedale"]},
]

# ---------------------------------------------------------------------------
# IT — Cultura del web
# ---------------------------------------------------------------------------

IT_INTERNET = [
    {"word": "meme", "hints": ["divertente", "virale", "immagine", "condividere", "internet"]},
    {"word": "hashtag", "hints": ["social", "tendenza", "simbolo", "Twitter", "post"]},
    {"word": "selfie", "hints": ["fotocamera", "frontale", "posa", "filtro", "condividere"]},
    {"word": "influencer", "hints": ["follower", "sponsorizzazioni", "Instagram", "contenuti", "famoso"]},
    {"word": "diretta", "hints": ["live", "spettatori", "chat", "gaming", "telecamera"]},
    {"word": "virale", "hints": ["diffusione", "video", "milioni", "internet", "improvviso"]},
    {"word": "emoji", "hints": ["faccine", "messaggi", "gialle", "espressioni", "tastiera"]},
    {"word": "filtro", "hints": ["foto", "bellezza", "Instagram", "cagnolino", "ritocco"]},
    {"word": "troll", "hints": ["commenti", "provocare", "anonimo", "internet", "ignorare"]},
    {"word": "spam", "hints": ["email", "indesiderata", "cartella", "pubblicità", "fastidiosa"]},
    {"word": "wifi", "hints": ["internet", "password", "router", "segnale", "gratis"]},
    {"word": "password", "hints": ["segreta", "accesso", "dimenticata", "sicurezza", "asterischi"]},
    {"word": "streaming", "hints": ["Netflix", "guardare", "online", "serie", "maratona"]},
    {"word": "youtuber", "hints": ["video", "canale", "iscritti", "telecamera", "vlog"]},
    {"word": "TikTok", "hints": ["balletti", "brevi", "video", "tendenze", "scorrere"]},
    {"word": "unboxing", "hints": ["pacco", "telecamera", "reazione", "nuovo", "apertura"]},
    {"word": "clickbait", "hints": ["titolo", "curiosità", "ingannevole", "shock", "anteprima"]},
    {"word": "screenshot", "hints": ["cattura", "prova", "telefono", "condividere", "chat"]},
    {"word": "notifica", "hints": ["suono", "telefono", "pallino", "distrazione", "continua"]},
    {"word": "algoritmo", "hints": ["feed", "consigli", "misterioso", "contenuti", "dipendenza"]},
    {"word": "avatar", "hints": ["profilo", "immagine", "digitale", "identità", "personaggio"]},
    {"word": "GIF", "hints": ["animata", "loop", "reazione", "divertente", "messaggi"]},
    {"word": "blog", "hints": ["scrivere", "post", "personale", "internet", "lettori"]},
    {"word": "vlog", "hints": ["telecamera", "quotidiano", "youtube", "vita", "parlare"]},
    {"word": "follower", "hints": ["social", "numero", "Instagram", "fan", "crescere"]},
    {"word": "like", "hints": ["pollice", "cuore", "tasto", "approvazione", "contare"]},
    {"word": "commenti", "hints": ["opinioni", "litigi", "scorrere", "tossici", "risposte"]},
    {"word": "download", "hints": ["file", "internet", "avanzamento", "attesa", "salvare"]},
    {"word": "gamer", "hints": ["console", "cuffie", "streaming", "notte", "energetica"]},
    {"word": "criptovalute", "hints": ["bitcoin", "digitale", "investimento", "volatile", "portafoglio"]},
]

# ---------------------------------------------------------------------------
# IT — Retrò
# ---------------------------------------------------------------------------

IT_RETRO = [
    {"word": "musicassetta", "hints": ["nastro", "musica", "riavvolgere", "matita", "walkman"]},
    {"word": "vinile", "hints": ["disco", "giradischi", "solchi", "collezionisti", "fruscio"]},
    {"word": "walkman", "hints": ["musica", "portatile", "cuffie", "cassetta", "ottanta"]},
    {"word": "macchina da scrivere", "hints": ["tasti", "inchiostro", "carta", "ticchettio", "vintage"]},
    {"word": "floppy disk", "hints": ["computer", "salvare", "quadrato", "obsoleto", "dati"]},
    {"word": "videocassetta", "hints": ["nastro", "riavvolgere", "noleggio", "film", "videoregistratore"]},
    {"word": "sala giochi", "hints": ["gettoni", "joystick", "cabinati", "neon", "record"]},
    {"word": "jukebox", "hints": ["bar", "monete", "canzoni", "luminoso", "cinquanta"]},
    {"word": "polaroid", "hints": ["foto", "istantanea", "scuotere", "bianco", "cornice"]},
    {"word": "telefono a disco", "hints": ["rotella", "filo", "lento", "vintage", "squillo"]},
    {"word": "gettone", "hints": ["cabina", "telefonata", "moneta", "bar", "scanalature"]},
    {"word": "Game Boy", "hints": ["Nintendo", "portatile", "Tetris", "grigio", "batterie"]},
    {"word": "tamagotchi", "hints": ["animaletto", "digitale", "nutrire", "bip", "novanta"]},
    {"word": "cubo di Rubik", "hints": ["rompicapo", "colori", "ruotare", "risolvere", "frustrazione"]},
    {"word": "discoteca", "hints": ["ballare", "sfera", "settanta", "luci", "febbre"]},
    {"word": "mixtape", "hints": ["canzoni", "cassetta", "regalo", "romantico", "selezione"]},
    {"word": "drive-in", "hints": ["film", "auto", "schermo", "aperto", "altoparlanti"]},
    {"word": "enciclopedia", "hints": ["volumi", "sapere", "scaffale", "pesante", "alfabetico"]},
    {"word": "fax", "hints": ["macchina", "carta", "ufficio", "bip", "obsoleto"]},
    {"word": "modem 56k", "hints": ["internet", "rumore", "lento", "occupato", "attesa"]},
    {"word": "pattini a rotelle", "hints": ["ruote", "pista", "settanta", "cadute", "discoteca"]},
    {"word": "lampada lava", "hints": ["bagliore", "cera", "ipnotica", "cameretta", "psichedelica"]},
    {"word": "stereo portatile", "hints": ["spalla", "musica", "batterie", "volume", "breakdance"]},
    {"word": "cabina telefonica", "hints": ["gettoni", "vetro", "strada", "Superman", "obsoleta"]},
    {"word": "telegramma", "hints": ["messaggio", "urgente", "stop", "poste", "antico"]},
    {"word": "grammofono", "hints": ["tromba", "dischi", "antico", "manovella", "musica"]},
    {"word": "proiettore diapositive", "hints": ["foto", "clic", "famiglia", "parete", "vacanze"]},
    {"word": "carosello", "hints": ["televisione", "pubblicità", "sera", "bambini", "nonni"]},
    {"word": "antenna", "hints": ["tetto", "segnale", "canali", "orientare", "disturbo"]},
    {"word": "negozio di dischi", "hints": ["vinili", "sfogliare", "musica", "poster", "weekend"]},
]

# ---------------------------------------------------------------------------
# IT — Fantasy
# ---------------------------------------------------------------------------

IT_FANTASY = [
    {"word": "drago", "hints": ["fuoco", "ali", "tesoro", "squame", "cavaliere"]},
    {"word": "mago", "hints": ["magia", "bacchetta", "barba", "incantesimi", "cappello"]},
    {"word": "unicorno", "hints": ["corno", "arcobaleno", "bianco", "magico", "puro"]},
    {"word": "fata", "hints": ["ali", "minuscola", "polvere", "bosco", "desiderio"]},
    {"word": "elfo", "hints": ["orecchie", "bosco", "arciere", "immortale", "aggraziato"]},
    {"word": "nano", "hints": ["barba", "miniera", "ascia", "basso", "montagna"]},
    {"word": "goblin", "hints": ["verde", "dispetti", "tesoro", "brutto", "caverna"]},
    {"word": "troll", "hints": ["ponte", "grosso", "clava", "pietra", "puzzolente"]},
    {"word": "sirena", "hints": ["coda", "mare", "canto", "squame", "marinai"]},
    {"word": "gigante", "hints": ["enorme", "fagiolo", "passi", "nuvole", "forza"]},
    {"word": "strega", "hints": ["scopa", "calderone", "incantesimi", "cappello", "gatto"]},
    {"word": "lupo mannaro", "hints": ["luna", "trasformazione", "ululato", "argento", "maledizione"]},
    {"word": "fantasma", "hints": ["infestare", "bianco", "trasparente", "castello", "catene"]},
    {"word": "fenice", "hints": ["fuoco", "rinascita", "ceneri", "immortale", "ali"]},
    {"word": "grifone", "hints": ["aquila", "leone", "ali", "maestoso", "guardiano"]},
    {"word": "castello", "hints": ["torri", "re", "fossato", "pietra", "ponte"]},
    {"word": "cavaliere", "hints": ["armatura", "spada", "cavallo", "missione", "scudo"]},
    {"word": "principessa", "hints": ["corona", "torre", "reale", "abito", "salvataggio"]},
    {"word": "re", "hints": ["trono", "corona", "regno", "comando", "reale"]},
    {"word": "missione", "hints": ["viaggio", "eroe", "impresa", "avventura", "ricompensa"]},
    {"word": "spada", "hints": ["lama", "cavaliere", "affilata", "leggendaria", "duello"]},
    {"word": "pozione", "hints": ["bottiglia", "magia", "preparare", "ingredienti", "bollicine"]},
    {"word": "incantesimo", "hints": ["magia", "parole", "bacchetta", "lanciare", "maledizione"]},
    {"word": "maledizione", "hints": ["male", "strega", "spezzare", "condanna", "incantesimo"]},
    {"word": "tesoro", "hints": ["oro", "forziere", "mappa", "pirati", "sepolto"]},
    {"word": "profezia", "hints": ["futuro", "prescelto", "antica", "destino", "pergamena"]},
    {"word": "portale", "hints": ["passaggio", "dimensione", "luminoso", "viaggio", "magia"]},
    {"word": "regno", "hints": ["reame", "re", "castello", "terre", "trono"]},
    {"word": "genio", "hints": ["lampada", "desideri", "tre", "fumo", "liberato"]},
    {"word": "pegaso", "hints": ["cavallo", "ali", "volare", "bianco", "mitologia"]},
]

# ---------------------------------------------------------------------------
# IT — Scienza e spazio
# ---------------------------------------------------------------------------

IT_SCIENCE = [
    {"word": "razzo", "hints": ["lancio", "spazio", "conto", "carburante", "NASA"]},
    {"word": "pianeta", "hints": ["orbita", "solare", "rotondo", "spazio", "sistema"]},
    {"word": "galassia", "hints": ["stelle", "spirale", "immensa", "universo", "lattea"]},
    {"word": "buco nero", "hints": ["gravità", "spazio", "luce", "misterioso", "enorme"]},
    {"word": "telescopio", "hints": ["stelle", "lente", "osservatorio", "lontano", "astronomo"]},
    {"word": "atomo", "hints": ["minuscolo", "nucleo", "fisica", "particelle", "materia"]},
    {"word": "gravità", "hints": ["cadere", "Newton", "mela", "forza", "Terra"]},
    {"word": "DNA", "hints": ["geni", "elica", "biologia", "codice", "ereditarietà"]},
    {"word": "robot", "hints": ["macchina", "artificiale", "metallo", "programmato", "futuro"]},
    {"word": "satellite", "hints": ["orbita", "segnale", "spazio", "parabola", "GPS"]},
    {"word": "asteroide", "hints": ["roccia", "spazio", "impatto", "fascia", "dinosauri"]},
    {"word": "cometa", "hints": ["coda", "ghiaccio", "cielo", "orbita", "luminosa"]},
    {"word": "eclissi", "hints": ["sole", "luna", "ombra", "rara", "occhialini"]},
    {"word": "meteora", "hints": ["cadente", "cielo", "bruciare", "desiderio", "notte"]},
    {"word": "tuta spaziale", "hints": ["astronauta", "bianca", "casco", "ossigeno", "ingombrante"]},
    {"word": "alieno", "hints": ["UFO", "verde", "spazio", "rapimento", "ignoto"]},
    {"word": "UFO", "hints": ["volante", "disco", "mistero", "luci", "avvistamento"]},
    {"word": "Marte", "hints": ["rosso", "pianeta", "rover", "colonia", "polvere"]},
    {"word": "allunaggio", "hints": ["Apollo", "bandiera", "astronauti", "impronta", "televisione"]},
    {"word": "stazione spaziale", "hints": ["orbita", "astronauti", "moduli", "fluttuare", "internazionale"]},
    {"word": "vaccino", "hints": ["ago", "immunità", "dottore", "protezione", "laboratorio"]},
    {"word": "batteri", "hints": ["microscopici", "germi", "infezione", "antibiotici", "ovunque"]},
    {"word": "evoluzione", "hints": ["Darwin", "specie", "adattamento", "graduale", "fossili"]},
    {"word": "dinosauro", "hints": ["estinto", "fossile", "enorme", "Jurassic", "ossa"]},
    {"word": "fossile", "hints": ["antico", "pietra", "ossa", "scavare", "museo"]},
    {"word": "elettricità", "hints": ["corrente", "fili", "scossa", "energia", "Tesla"]},
    {"word": "calamita", "hints": ["attrazione", "poli", "metallo", "frigorifero", "campo"]},
    {"word": "laser", "hints": ["raggio", "rosso", "preciso", "luce", "puntatore"]},
    {"word": "esperimento", "hints": ["laboratorio", "ipotesi", "prova", "risultati", "occhiali"]},
    {"word": "chimica", "hints": ["elementi", "reazioni", "laboratorio", "formule", "esplosioni"]},
]

# ---------------------------------------------------------------------------
# IT — Musica
# ---------------------------------------------------------------------------

IT_MUSIC = [
    {"word": "chitarra", "hints": ["corde", "strimpellare", "rock", "acustica", "accordi"]},
    {"word": "pianoforte", "hints": ["tasti", "nero", "bianco", "classica", "pedali"]},
    {"word": "batteria", "hints": ["bacchette", "ritmo", "rumorosa", "piatti", "tempo"]},
    {"word": "violino", "hints": ["archetto", "corde", "classica", "orchestra", "mento"]},
    {"word": "microfono", "hints": ["cantare", "palco", "voce", "asta", "karaoke"]},
    {"word": "concerto", "hints": ["palco", "folla", "biglietti", "live", "luci"]},
    {"word": "orchestra", "hints": ["direttore", "strumenti", "classica", "sinfonia", "eleganza"]},
    {"word": "DJ", "hints": ["console", "discoteca", "mixare", "cuffie", "festa"]},
    {"word": "rapper", "hints": ["rime", "beat", "microfono", "flow", "strada"]},
    {"word": "opera", "hints": ["canto", "drammatica", "italiana", "soprano", "teatro"]},
    {"word": "jazz", "hints": ["sassofono", "improvvisazione", "morbido", "club", "swing"]},
    {"word": "rock", "hints": ["chitarra", "forte", "band", "pelle", "concerto"]},
    {"word": "coro", "hints": ["voci", "chiesa", "armonia", "cantare", "tuniche"]},
    {"word": "sassofono", "hints": ["jazz", "ottone", "curvo", "morbido", "assolo"]},
    {"word": "tromba", "hints": ["ottone", "forte", "jazz", "pistoni", "fanfara"]},
    {"word": "flauto", "hints": ["fiato", "argento", "classica", "soffiare", "delicato"]},
    {"word": "arpa", "hints": ["corde", "angelo", "elegante", "pizzicare", "dorata"]},
    {"word": "fisarmonica", "hints": ["mantice", "folk", "bottoni", "liscio", "balera"]},
    {"word": "cornamusa", "hints": ["Scozia", "kilt", "forte", "bordone", "tradizione"]},
    {"word": "ukulele", "hints": ["piccolo", "Hawaii", "corde", "allegro", "spiaggia"]},
    {"word": "melodia", "hints": ["motivo", "canticchiare", "orecchiabile", "note", "canzone"]},
    {"word": "testo", "hints": ["parole", "canzone", "memorizzare", "significato", "cantare"]},
    {"word": "album", "hints": ["canzoni", "copertina", "artista", "uscita", "tracce"]},
    {"word": "band", "hints": ["membri", "strumenti", "tour", "garage", "fama"]},
    {"word": "festival", "hints": ["musica", "campeggio", "palchi", "estate", "folla"]},
    {"word": "playlist", "hints": ["canzoni", "selezione", "umore", "casuale", "Spotify"]},
    {"word": "autotune", "hints": ["voce", "studio", "intonazione", "robotica", "trap"]},
    {"word": "bis", "hints": ["concerto", "ancora", "applausi", "finale", "pubblico"]},
    {"word": "direttore d'orchestra", "hints": ["orchestra", "bacchetta", "gesti", "tempo", "frac"]},
    {"word": "Sanremo", "hints": ["festival", "febbraio", "fiori", "canzoni", "televoto"]},
]

# ---------------------------------------------------------------------------
# IT — In giro per il mondo
# ---------------------------------------------------------------------------

IT_WORLD = [
    {"word": "Parigi", "hints": ["Eiffel", "Francia", "romantica", "croissant", "moda"]},
    {"word": "Roma", "hints": ["Colosseo", "Italia", "antica", "carbonara", "Vaticano"]},
    {"word": "Londra", "hints": ["Inghilterra", "pioggia", "regina", "autobus", "tè"]},
    {"word": "New York", "hints": ["grattacieli", "taxi", "Broadway", "mela", "Manhattan"]},
    {"word": "Tokyo", "hints": ["Giappone", "neon", "sushi", "affollata", "tecnologia"]},
    {"word": "Venezia", "hints": ["canali", "gondola", "Italia", "maschere", "ponti"]},
    {"word": "Egitto", "hints": ["piramidi", "faraone", "deserto", "Nilo", "sfinge"]},
    {"word": "Sahara", "hints": ["deserto", "sabbia", "cammelli", "immenso", "Africa"]},
    {"word": "Amazzonia", "hints": ["foresta", "fiume", "Brasile", "giungla", "biodiversità"]},
    {"word": "Everest", "hints": ["montagna", "altissima", "scalata", "Nepal", "neve"]},
    {"word": "Hawaii", "hints": ["isole", "surf", "vulcano", "fiori", "paradiso"]},
    {"word": "Australia", "hints": ["canguro", "outback", "Sydney", "barriera", "koala"]},
    {"word": "Brasile", "hints": ["carnevale", "calcio", "samba", "spiagge", "Rio"]},
    {"word": "India", "hints": ["spezie", "Bollywood", "mucche", "colori", "yoga"]},
    {"word": "Cina", "hints": ["muraglia", "drago", "riso", "panda", "antica"]},
    {"word": "Islanda", "hints": ["geyser", "ghiaccio", "vulcani", "aurora", "freddo"]},
    {"word": "Grecia", "hints": ["isole", "mitologia", "rovine", "feta", "azzurro"]},
    {"word": "Svizzera", "hints": ["Alpi", "cioccolato", "orologi", "neutrale", "banche"]},
    {"word": "Norvegia", "hints": ["fiordi", "vichinghi", "neve", "aurora", "salmone"]},
    {"word": "Marocco", "hints": ["mercati", "spezie", "deserto", "menta", "mosaici"]},
    {"word": "Dubai", "hints": ["grattacieli", "lusso", "deserto", "oro", "centri"]},
    {"word": "Las Vegas", "hints": ["casinò", "luci", "deserto", "matrimoni", "azzardo"]},
    {"word": "Muraglia cinese", "hints": ["Cina", "lunga", "antica", "mattoni", "torrette"]},
    {"word": "Torre Eiffel", "hints": ["Parigi", "ferro", "luci", "alta", "romantica"]},
    {"word": "Colosseo", "hints": ["Roma", "gladiatori", "arena", "antico", "rovine"]},
    {"word": "Statua della Libertà", "hints": ["America", "fiaccola", "verde", "isola", "regalo"]},
    {"word": "Niagara", "hints": ["cascate", "confine", "nebbiolina", "battello", "viaggio"]},
    {"word": "Antartide", "hints": ["pinguini", "ghiaccio", "freddo", "ricerca", "remota"]},
    {"word": "Caraibi", "hints": ["isole", "pirati", "spiagge", "rum", "turchese"]},
    {"word": "safari", "hints": ["Africa", "animali", "jeep", "binocolo", "savana"]},
]

# ---------------------------------------------------------------------------
# Write all JSON files
# ---------------------------------------------------------------------------

FILES = [
    ("public/words/en/easy.json",          "en", "easy",          EN_EASY),
    ("public/words/en/entertainment.json", "en", "entertainment", EN_ENTERTAINMENT),
    ("public/words/en/everyday.json",      "en", "everyday",      EN_EVERYDAY),
    ("public/words/en/animals.json",       "en", "animals",       EN_ANIMALS),
    ("public/words/en/sports.json",        "en", "sports",        EN_SPORTS),
    ("public/words/en/school.json",        "en", "school",        EN_SCHOOL),
    ("public/words/en/celebrities.json",   "en", "celebrities",   EN_CELEBRITIES),
    ("public/words/en/spicy.json",         "en", "spicy",         EN_SPICY),
    ("public/words/en/food.json",          "en", "food",          EN_FOOD),
    ("public/words/en/professions.json",   "en", "professions",   EN_PROFESSIONS),
    ("public/words/en/internet.json",      "en", "internet",      EN_INTERNET),
    ("public/words/en/retro.json",         "en", "retro",         EN_RETRO),
    ("public/words/en/fantasy.json",       "en", "fantasy",       EN_FANTASY),
    ("public/words/en/science.json",       "en", "science",       EN_SCIENCE),
    ("public/words/en/music.json",         "en", "music",         EN_MUSIC),
    ("public/words/en/world.json",         "en", "world",         EN_WORLD),
    ("public/words/it/easy.json",          "it", "easy",          IT_EASY),
    ("public/words/it/entertainment.json", "it", "entertainment", IT_ENTERTAINMENT),
    ("public/words/it/everyday.json",      "it", "everyday",      IT_EVERYDAY),
    ("public/words/it/animals.json",       "it", "animals",       IT_ANIMALS),
    ("public/words/it/sports.json",        "it", "sports",        IT_SPORTS),
    ("public/words/it/school.json",        "it", "school",        IT_SCHOOL),
    ("public/words/it/celebrities.json",   "it", "celebrities",   IT_CELEBRITIES),
    ("public/words/it/spicy.json",         "it", "spicy",         IT_SPICY),
    ("public/words/it/food.json",          "it", "food",          IT_FOOD),
    ("public/words/it/professions.json",   "it", "professions",   IT_PROFESSIONS),
    ("public/words/it/internet.json",      "it", "internet",      IT_INTERNET),
    ("public/words/it/retro.json",         "it", "retro",         IT_RETRO),
    ("public/words/it/fantasy.json",       "it", "fantasy",       IT_FANTASY),
    ("public/words/it/science.json",       "it", "science",       IT_SCIENCE),
    ("public/words/it/music.json",         "it", "music",         IT_MUSIC),
    ("public/words/it/world.json",         "it", "world",         IT_WORLD),
]


def main() -> None:
    for path, lang, category, words in FILES:
        # Sanity-check the content contract before writing anything.
        seen = set()
        for entry in words:
            assert entry["word"].strip(), f"{path}: empty word"
            assert entry["word"] not in seen, f"{path}: duplicate {entry['word']}"
            seen.add(entry["word"])
            assert (
                len(entry["hints"]) == 5
            ), f"{path}: {entry['word']} has {len(entry['hints'])} hints (want 5)"

        data = {
            "version": 2,
            "lang": lang,
            "category": category,
            "words": words,
        }
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"Wrote {len(words)} entries to {path}")


if __name__ == "__main__":
    main()
