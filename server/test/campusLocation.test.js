import test from 'node:test';
import assert from 'node:assert/strict';
import { getRelevantITUContext } from '../src/services/knowledgeService.js';
import { buildGroundedFallbackAnswer } from '../src/services/llmService.js';

test('campus location question returns ITU address instead of facilities', () => {
  const question = 'where is the itu campus in lahore located';
  const context = JSON.parse(getRelevantITUContext(question).context);
  const answer = buildGroundedFallbackAnswer(question);

  assert.deepEqual(Object.keys(context), ['campuses']);
  assert.equal(context.campuses[0].location, 'Arfa Software Technology Park (ASTP), Ferozepur Road, Lahore');
  assert.match(answer, /main city campus is at Arfa Software Technology Park \(ASTP\), Ferozepur Road, Lahore/i);
  assert.match(answer, /Barki Road, Lahore.*phased development/i);
  assert.doesNotMatch(answer, /research labs|student societies|library/i);
});

test('campus facilities question still retrieves facility information', () => {
  const context = JSON.parse(getRelevantITUContext('What facilities and labs are on campus?').context);
  const answer = buildGroundedFallbackAnswer('What facilities and labs are on campus?');

  assert.ok(context.campusLifeAndFacilities);
  assert.match(answer, /Machine Learning Lab/i);
});

test('multi-part campus facilities question is not mistaken for a campus address', () => {
  const question = "Summarize ITU's campus facilities by naming the research labs, student societies, library location and resources, and Plan9 connection.";
  const context = JSON.parse(getRelevantITUContext(question).context);
  const answer = buildGroundedFallbackAnswer(question);
  const facilities = context.campusLifeAndFacilities;

  assert.deepEqual(Object.keys(context), ['campusLifeAndFacilities']);
  assert.ok(facilities.researchLabs);
  assert.ok(facilities.studentSocieties);
  assert.ok(facilities.library);
  assert.ok(facilities.incubationAndIndustry);
  assert.match(answer, /Research labs:/);
  assert.match(answer, /Student societies:/);
  assert.match(answer, /Library: ASTP 6th Floor; resources:/);
  assert.match(answer, /Plan9 and industry:/);
  assert.doesNotMatch(answer, /main city campus is at/i);
});

test('library location question retrieves library details, not campus addresses', () => {
  const question = 'Where is the ITU library located and what resources are available?';
  const context = JSON.parse(getRelevantITUContext(question).context);
  const answer = buildGroundedFallbackAnswer(question);

  assert.deepEqual(Object.keys(context), ['campusLifeAndFacilities']);
  assert.deepEqual(Object.keys(context.campusLifeAndFacilities), ['library']);
  assert.match(answer, /Library: ASTP 6th Floor; resources: Over 20,000 physical volumes/);
  assert.doesNotMatch(answer, /main city campus is at/i);
});

test('general transport question uses verified service and semester fee data', () => {
  const answer = buildGroundedFallbackAnswer('does itu facilitate transport?');

  assert.match(answer, /dedicated air-conditioned bus and coaster routes/i);
  assert.match(answer, /PKR 28,000 per semester/i);
  assert.match(answer, /Lahore Metro Bus/i);
  assert.doesNotMatch(answer, /could not generate/i);
});

test('route stop question returns the selected route stops and times', () => {
  const answer = buildGroundedFallbackAnswer('What are the stops on Route 1?');

  assert.match(answer, /Route 1 \(Canal & Southern Lahore Line\)/);
  assert.match(answer, /Thokar Niaz Baig.*07:15 AM/);
  assert.match(answer, /Arfa Software Technology Park \(ASTP\) Campus.*08:15 AM/);
  assert.doesNotMatch(answer, /Route 2/);
});

test('numbered route question identifies that route and its service area', () => {
  const answer = buildGroundedFallbackAnswer('Which areas does Route 2 serve?');

  assert.match(answer, /Route 2 is the Northern Lahore & City Center Line/);
  assert.match(answer, /Shahdara Chowk/);
  assert.match(answer, /Ichhra Metro Bus Station/);
  assert.doesNotMatch(answer, /Route 1:/);
});

test('route number wording selects that exact numbered route', () => {
  const answer = buildGroundedFallbackAnswer('What is route number 2?');

  assert.match(answer, /Route 2 is the Northern Lahore & City Center Line/);
  assert.match(answer, /Shahdara Chowk/);
  assert.doesNotMatch(answer, /Route 1|Route 3|Route 4/);
});