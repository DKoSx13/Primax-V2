import unittest, io
import cv2
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from app import recognize, membership_candidates, normalize_membership, preprocess
class V11OCR(unittest.TestCase):
 def test_membership_formats(self):
  for text in ('PRIM001','PRIM999','PRIM001A'):
   self.assertEqual(normalize_membership(text),text)
  for text in ('PRIME-001','PRIME-A001','PRIME-AA001','PRIME-000111'):
   self.assertEqual(normalize_membership(text),text)
  self.assertEqual(normalize_membership('PRIME-AAOO1'),'PRIME-AA001')
 def test_membership_reference(self):
  fixture = Path(__file__).parent / 'fixtures' / 'membership-PRIME-001.png'
  result = recognize(fixture.read_bytes(), 'membership')
  self.assertEqual(result['plate'], 'PRIME-001')
  self.assertGreaterEqual(result['confidence'], .75)
 def test_membership_words_are_only_joined_when_aligned_and_incomplete(self):
  def word(text, left, top, width):
   return {'text': text, 'left': left, 'top': top, 'width': width, 'height': 20, 'conf': 94}
  for words, expected in [
   ([word('PRIME', 60, 20, 50), word('PRIME-001', 0, 80, 90)], ['PRIME-001']),
   ([word('PRIME', 0, 20, 50), word('PRIME-001', 55, 20, 90)], ['PRIME-001']),
   ([word('PRIME', 0, 20, 50), word('-001', 55, 22, 40)], ['PRIME-001']),
   ([word('PRIME', 0, 20, 50), word('001', 0, 55, 40)], []),
  ]:
   with self.subTest(words=words):
    self.assertEqual([number for number, _, _ in membership_candidates(words)], expected)
 def test_blank_membership_has_no_candidate(self):
  fixture = Path(__file__).parent / 'fixtures' / 'no-plate.png'
  self.assertIsNone(recognize(fixture.read_bytes(), 'membership')['plate'])
 def test_membership_photo(self):
  samples = [('PRIM001A','DejaVuSans-Bold.ttf'), ('PRIME-001','DejaVuSansMono-Bold.ttf'),
             ('PRIME-A001','DejaVuSans-Bold.ttf'), ('PRIME-AA001','DejaVuSans-Bold.ttf')]
  for code, font_file in samples:
   with self.subTest(code=code):
    legacy = code == 'PRIM001A'
    image=Image.new('RGB',(700,200) if legacy else (610,140),'white');d=ImageDraw.Draw(image)
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/'+font_file,70 if legacy else 64)
    d.text((80,50) if legacy else (30,24),code,font=font,fill='black');buf=io.BytesIO();image.save(buf,format='PNG')
    result=recognize(buf.getvalue(),'membership');self.assertEqual(result['plate'],code);self.assertGreaterEqual(result['confidence'],.75)
 def test_screen_perspective_plate(self):
  image=cv2.imread('fixtures/ABC-123.png',cv2.IMREAD_GRAYSCALE);h,w=image.shape
  matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]),np.float32([[20,15],[w-20,0],[w-1,h-15],[0,h-1]]))
  screen=cv2.warpPerspective(image,matrix,(w,h),borderValue=255)
  ok,raw=cv2.imencode('.png',screen);self.assertTrue(ok)
  result=recognize(raw.tobytes());self.assertEqual(result['plate'],'ABC-123')
 def test_preprocessing_variants(self):
  image=cv2.imread('fixtures/ABC-123.png',cv2.IMREAD_GRAYSCALE)
  self.assertGreaterEqual(len(preprocess(image)),5)
