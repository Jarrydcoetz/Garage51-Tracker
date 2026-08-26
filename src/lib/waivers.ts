// Garage51 Activity Waiver Library v1.0
// Status: Final — awaiting UAE legal review before Arabic translation

export type WaiverDef = {
  id: string;
  version: string;
  title: string;
  subtitle: string;
  summary: string;        // short risk summary shown collapsed
  fullText: string;       // complete agreement text shown expanded
  checkboxes: string[];   // all must be ticked
  requiresGuardian?: boolean;
  juniorAcknowledgement?: string;
};

export const WAIVERS: Record<string, WaiverDef> = {

  "COACH-01": {
    id: "COACH-01",
    version: "1.0",
    title: "Adult / Senior Motorcycle Coaching",
    subtitle: "Participant Risk Acknowledgement & Coaching Agreement",
    summary: "Motorcycle coaching involves physical risks including falls, collisions, mechanical failure, serious injury, permanent disability and death. You agree to follow all coach instructions and ride within your ability.",
    fullText: `ADULT / SENIOR MOTORCYCLE COACHING
Participant Risk Acknowledgement & Coaching Agreement
Version 1.0 — Garage51 / Area51

1. ACTIVITY
This agreement applies to adult motorcycle coaching, motocross coaching, off-road coaching, riding instruction, skills training, performance training, race preparation and related training services.

2. COACHING RISKS
I understand that motorcycle coaching involves physical and technical activities that may increase the difficulty or intensity of riding.

Risks may include:
- falls;
- loss of control;
- collisions;
- jumps;
- braking and acceleration exercises;
- cornering exercises;
- technical terrain;
- mechanical failure;
- fatigue;
- physical exertion;
- errors in judgement;
- serious injury;
- permanent disability; and
- death.

3. COACH INSTRUCTIONS
I agree to follow the instructions of the coach and authorised personnel.

I understand that the coach may:
- modify an exercise;
- change the training area;
- change the difficulty;
- require rest;
- stop an exercise;
- stop the session;
- restrict a particular technique; or
- refuse an exercise that they reasonably consider unsuitable or unsafe.

4. MY ABILITY
I agree to ride within my ability and immediately tell the coach if I do not understand an instruction or do not feel capable of performing an exercise safely. I will not attempt a manoeuvre beyond my ability simply because another rider is doing so.

5. HEALTH AND FITNESS
I confirm that I am physically and mentally capable of participating. I will disclose relevant injuries, medical limitations or physical conditions that may affect safe participation. I will immediately inform the coach of any pain, dizziness, unusual fatigue or other condition that may make continued participation unsafe.

6. PERFORMANCE DISCLAIMER
I understand that coaching is intended to develop skills and performance but no specific result is guaranteed. The Provider and coach do not guarantee any particular lap time, championship result, race result, skill level, fitness result, performance improvement or other specific outcome.

7. EQUIPMENT
I agree to use the protective equipment required for the training activity.

8. RISK ACKNOWLEDGEMENT
I understand the risks associated with motorcycle coaching and voluntarily choose to participate. Nothing in this Agreement excludes or limits any liability, right or remedy that cannot lawfully be excluded or limited under UAE law.`,
    checkboxes: [
      "I have read and understood the Adult Coaching Risk Acknowledgement and agree to follow all coach and safety instructions.",
      "I understand that motorcycle coaching involves inherent risks, including serious injury, permanent disability and death.",
      "I confirm that I am fit to participate.",
    ],
  },

  "COACH-02": {
    id: "COACH-02",
    version: "1.0",
    title: "Junior Motorcycle Coaching",
    subtitle: "Parent / Guardian Consent & Junior Rider Risk Agreement",
    summary: "Junior motorcycle coaching involves serious risks including falls, collisions, serious injury, permanent disability and death. As parent or legal guardian you are providing consent and confirming the junior participant is fit to participate.",
    fullText: `JUNIOR MOTORCYCLE COACHING
Parent / Guardian Consent & Junior Rider Risk Agreement
Version 1.0 — Garage51 / Area51

1. JUNIOR PARTICIPANT
This agreement is completed by the parent or legal guardian of the junior rider.

2. PARENT / GUARDIAN AUTHORITY
I confirm that I am the parent or legal guardian of the Junior Participant and have authority to provide consent for the Junior Participant to participate.

3. UNDERSTANDING OF RISKS
I understand that motocross, off-road riding and motorcycle coaching involve inherent risks, including:
- falls;
- collisions;
- loss of control;
- jumps;
- uneven terrain;
- mechanical failure;
- other riders;
- changing track conditions;
- physical exertion;
- serious injury;
- permanent disability; and
- death.

I have considered these risks in relation to the Junior Participant's age, experience, physical ability and suitability for the selected activity.

4. JUNIOR RIDER REQUIREMENTS
I agree that the Junior Participant must:
- follow the coach's instructions;
- follow all safety rules;
- use all required protective equipment;
- remain within designated riding areas;
- ride within their ability;
- immediately report injury or equipment problems;
- stop when instructed.

5. COACH AUTHORITY
I understand that the coach may stop or modify the Junior Participant's training where the coach reasonably considers that:
- the exercise is unsuitable;
- the Junior Participant is fatigued;
- the Junior Participant is not following instructions;
- the Junior Participant is riding beyond their ability; or
- continued participation presents a safety risk.

6. MEDICAL INFORMATION
I confirm that I have provided accurate information concerning the Junior Participant's relevant health, injuries, physical limitations and ability to participate. I will notify the Provider of any relevant change in circumstances.

7. EMERGENCY MEDICAL ASSISTANCE
In an emergency, I authorise the Provider and its authorised personnel to contact emergency services and arrange appropriate emergency medical assistance for the Junior Participant. I understand that the Provider does not itself provide medical treatment.

8. SUPERVISION
The Junior Participant must remain under the supervision arrangements specified by the Provider during the booked activity. Unless separately agreed in writing, the Provider's responsibility for supervision begins when the Junior Participant is formally checked in and ends when the activity concludes or the Junior Participant is released according to the Provider's collection procedure.

9. RISK ACKNOWLEDGEMENT
I understand the risks associated with junior motorcycle coaching and voluntarily give permission for the Junior Participant to participate. Nothing in this Agreement excludes or limits any liability, right or remedy that cannot lawfully be excluded or limited under UAE law.`,
    checkboxes: [
      "I confirm that I am the parent or legal guardian of the Junior Participant and have authority to provide this consent.",
      "I have read and understood the Junior Coaching Risk Acknowledgement and understand the risks of motorcycle coaching.",
      "I confirm that I have provided accurate information regarding the Junior Participant's health and ability to participate.",
      "I authorise emergency medical assistance to be arranged if reasonably necessary.",
    ],
    requiresGuardian: true,
    juniorAcknowledgement: "My coach has explained the safety rules to me and I agree to follow their instructions.",
  },

  "RENT-01": {
    id: "RENT-01",
    version: "1.0",
    title: "Motorcycle Rental",
    subtitle: "Rental Risk Acknowledgement & Motorcycle Use Agreement",
    summary: "Motorcycle rental involves risks including falls, collisions, loss of control, mechanical failure and death. You agree to use the motorcycle only as authorised, comply with all safety instructions, and understand your responsibilities concerning damage and misuse.",
    fullText: `MOTORCYCLE RENTAL
Rental Risk Acknowledgement & Motorcycle Use Agreement
Version 1.0 — Garage51 / Area51

1. RIDER ELIGIBILITY
I confirm that I satisfy all applicable age, licence, experience and other eligibility requirements for the Motorcycle and intended use. Where a motorcycle licence is required by law, I confirm that I hold the required valid licence.

2. MOTORCYCLE CONDITION
I agree to inspect the Motorcycle before use and report any apparent damage, defect or abnormal condition before riding.

3. AUTHORISED USE
I agree to:
- use the Motorcycle only for the authorised purpose;
- ride only in authorised locations;
- comply with applicable laws;
- follow Provider instructions;
- use required protective equipment;
- operate the Motorcycle responsibly.

4. PROHIBITED USE
I must not:
- allow another person to ride the Motorcycle;
- sub-rent or lend the Motorcycle;
- modify the Motorcycle;
- tamper with safety equipment;
- race or compete unless specifically authorised;
- use the Motorcycle outside authorised areas;
- ride while impaired;
- deliberately abuse the Motorcycle.

5. RIDING RISK
I understand that motorcycle riding involves inherent risks including:
- falls;
- collisions;
- loss of control;
- mechanical failure;
- road or terrain hazards;
- actions of other road users or riders;
- environmental conditions;
- serious injury;
- permanent disability; and
- death.

6. DAMAGE TO RENTAL MOTORCYCLE
Subject to applicable law and insurance, I may be responsible for reasonable costs arising from damage, loss or recovery caused by my misuse, negligence, reckless conduct, deliberate damage, unauthorised use, or breach of the rental agreement.

7. ACCIDENT
I will immediately notify the Provider of any accident, collision, injury, damage or mechanical failure and cooperate with reasonable accident-reporting and insurance procedures.

8. RETURN
I agree to return the Motorcycle at the agreed time and location in the condition required by the applicable rental agreement.

9. RISK ACKNOWLEDGEMENT
I understand the risks associated with motorcycle rental and voluntarily choose to participate. Nothing in this Agreement excludes or limits any liability, right or remedy that cannot lawfully be excluded or limited under UAE law.`,
    checkboxes: [
      "I confirm that I meet the applicable rider eligibility and licensing requirements.",
      "I have read and understood the Motorcycle Rental Risk Acknowledgement and Use Agreement.",
      "I agree to operate the Motorcycle only as authorised and to comply with all safety instructions.",
      "I understand my responsibilities concerning damage, misuse, loss and unauthorised use of the Motorcycle.",
    ],
  },

  "DDE-01": {
    id: "DDE-01",
    version: "1.0",
    title: "Desert Tour / DDE Experience",
    subtitle: "Desert Motorcycle Activity Risk Acknowledgement & Participation Agreement",
    summary: "Desert motorcycle activities take place in remote, unpredictable environments. Risks include extreme heat, dehydration, soft sand, steep dunes, hidden obstacles, delayed emergency response, serious injury, permanent disability and death.",
    fullText: `DESERT TOUR / GARAGE51 DDE EXPERIENCE
Desert Motorcycle Activity Risk Acknowledgement & Participation Agreement
Version 1.0 — Garage51 / Area51

1. ACTIVITIES COVERED
This agreement applies to:
- guided desert motorcycle rides;
- Garage51 Desert Experience / DDE;
- Ducati Desert X experiences;
- G51 Desmo450 Rally experiences;
- guided off-road motorcycle tours;
- other substantially similar desert motorcycle experiences.

2. DESERT ENVIRONMENT
I understand that desert motorcycle activities take place in an environment that can be remote and unpredictable.

Risks include:
- extreme heat;
- dehydration;
- sun exposure;
- heat exhaustion;
- sandstorms;
- dust;
- reduced visibility;
- soft sand;
- dunes;
- steep ascents and descents;
- rocks;
- hidden obstacles;
- changing terrain;
- wildlife;
- remote locations;
- limited communications;
- delayed emergency response;
- mechanical failure;
- recovery delays;
- fatigue;
- serious injury;
- permanent disability; and
- death.

3. GUIDED GROUP RIDING
Where the Activity is guided, I agree to:
- follow the designated guide;
- remain with the group;
- maintain the instructed riding distance;
- follow guide instructions;
- not deliberately leave the group;
- notify the guide if I become separated;
- stop when instructed.

4. RIDING ABILITY
I confirm that I have provided accurate information regarding my motorcycle and off-road riding experience. I agree not to attempt terrain or manoeuvres beyond my ability.

5. ENVIRONMENTAL CONDITIONS
I understand that desert conditions may change during the Activity. The Provider may modify, shorten, postpone, relocate or suspend an Activity where reasonably necessary because of weather, heat, sandstorms, visibility, terrain, government direction or safety concerns.

6. HYDRATION AND PERSONAL PREPARATION
I agree to follow instructions concerning hydration, rest, sun protection, protective equipment, food, clothing and medical needs.

7. REMOTE EMERGENCY RESPONSE
I understand that desert activities may take place far from medical facilities. Emergency response may be delayed by distance, terrain, weather, visibility, communications, vehicle access or recovery requirements.

8. MULTI-DAY EXPERIENCE
For multi-day experiences, I understand that the itinerary may change due to weather, safety, availability, government direction or other operational circumstances.

9. RISK ACKNOWLEDGEMENT
I understand the risks associated with desert motorcycle activities and voluntarily choose to participate. Nothing in this Agreement excludes or limits any liability, right or remedy that cannot lawfully be excluded or limited under UAE law.`,
    checkboxes: [
      "I have read and understood the Desert / DDE Risk Acknowledgement.",
      "I understand the additional risks associated with remote desert riding, including heat, dehydration, terrain and delayed emergency response.",
      "I agree to remain with the group and follow all guide and safety instructions.",
      "I confirm that I am fit to participate.",
    ],
  },

  "TRACK-01": {
    id: "TRACK-01",
    version: "1.0",
    title: "Area51 MX Track Use",
    subtitle: "Participant Risk Acknowledgement & Track Participation Agreement",
    summary: "Motocross and off-road motorcycle riding are inherently hazardous. Risks include falls, collisions, jumps, ruts, loose sand, changing track conditions, serious injury, permanent disability and death.",
    fullText: `AREA51 MX TRACK USE
Participant Risk Acknowledgement & Track Participation Agreement
Version 1.0 — Garage51 / Area51

1. ACTIVITY
This agreement applies to participation in motocross, off-road motorcycle practice, recreational track riding, training sessions and other authorised motorcycle activities at Area51 MX Park or another designated motocross/off-road venue.

2. INHERENT RISKS
I understand that motocross and off-road motorcycle riding are inherently hazardous activities.

Risks include, but are not limited to:
- falls;
- loss of control;
- collisions with other riders;
- collisions with motorcycles, vehicles, barriers or objects;
- jumps and landings;
- berms;
- ruts;
- uneven surfaces;
- loose sand;
- rocks and other obstacles;
- dust and reduced visibility;
- changing track conditions;
- mechanical or tyre failure;
- errors of judgement;
- rider inexperience;
- unpredictable actions of other riders;
- extreme heat;
- dehydration;
- serious injury;
- permanent disability; and
- death.

3. MY RESPONSIBILITIES
I agree that I will:
- ride within my ability;
- maintain control of my motorcycle;
- maintain a safe distance from other riders;
- follow all track rules;
- follow all instructor, marshal and staff instructions;
- obey all flags and signals;
- use all required protective equipment;
- ride only in designated areas;
- not deliberately endanger or obstruct another rider;
- not ride while impaired;
- immediately report accidents, injuries or mechanical problems; and
- stop riding immediately when instructed by authorised staff.

4. TRACK CONDITIONS
I understand that track conditions may change during a riding session including changes to surface condition, ruts, jumps, berms, traction, visibility and rider traffic. I accept that I must adjust my riding to the conditions and my ability.

5. PROTECTIVE EQUIPMENT
I agree to wear all protective equipment required by the Provider, including approved helmet, goggles, gloves, motocross boots, protective clothing, body armour, knee protection and elbow protection.

6. SAFETY INTERVENTION
I understand that Area51 personnel may stop, restrict or suspend my riding where they reasonably consider that I am riding unsafely, exceeding my ability, not following instructions, impaired, not properly equipped, or where continued participation presents a safety risk.

7. HEALTH
I confirm that I am physically and mentally capable of participating. I agree not to participate if I am injured, medically unfit, excessively fatigued or impaired. I will disclose any known medical condition, injury or limitation that I reasonably believe may affect safe participation.

8. RISK ACKNOWLEDGEMENT
I understand the inherent risks of motocross and off-road riding and voluntarily choose to participate. Nothing in this Agreement excludes or limits any liability, right or remedy that cannot lawfully be excluded or limited under UAE law.`,
    checkboxes: [
      "I have read and understood the Area51 MX Track Use Risk Acknowledgement and agree to comply with all track safety rules and instructions.",
      "I understand that motocross involves inherent risks, including serious injury, permanent disability and death.",
      "I confirm that I am fit to participate and will not ride while impaired or medically unfit.",
    ],
  },

};

// Map service type + category to required waiver IDs
export function getRequiredWaivers(
  serviceType: string,
  riderCategory: string | null,
  desertSelection: string
): string[] {
  if (serviceType === "academy") {
    return [riderCategory === "junior" ? "COACH-02" : "COACH-01"];
  }
  if (serviceType === "rental") {
    return ["RENT-01"];
  }
  if (serviceType === "desert_tour") {
    // Desmo / rental tours also require the rental waiver
    const needsRental = ["desmo2h", "desmo4h", "group2h", "multiday"].includes(desertSelection);
    return needsRental ? ["DDE-01", "RENT-01"] : ["DDE-01"];
  }
  if (serviceType === "membership") {
    return ["TRACK-01"];
  }
  // workshop, motorcycle_storage — no waiver
  return [];
}

// Compute a deterministic reference for this waiver version
// (used as document_hash in the acceptance record)
export function waiverRef(waiver: WaiverDef): string {
  return `${waiver.id}-v${waiver.version}`;
}
