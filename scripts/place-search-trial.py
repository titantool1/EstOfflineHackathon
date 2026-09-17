#!/usr/bin/env python3
"""Bounded Kakao search experiment; no LLM, database writes, or UI changes."""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request

ANCHORS = ["염창역", "망원역", "광주송정역"]
TERMS = ["페트병 수거함", "무인회수기", "수퍼빈", "카페"]
ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json"


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [float(a['x']), float(a['y']), float(b['x']), float(b['y'])])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return round(6371000 * 2 * math.asin(math.sqrt(min(1, h))))


def read_key(path):
    key = os.environ.get('KAKAO_REST_API_KEY', '').strip()
    if key:
        return key
    if path.is_file():
        for line in path.read_text(encoding='utf-8').splitlines():
            match = re.match(r'^\s*(?:export\s+)?KAKAO_REST_API_KEY\s*=\s*(.*?)\s*$', line)
            if match:
                return match[1].strip('\"\'')
    return ''


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=root / '.env')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    plan = {'anchors': ANCHORS, 'terms': TERMS, 'radius_m': 3000, 'max_calls': 18,
            'page': 1, 'size': 15, 'natural_query': '<역 이름> 근처 페트병 수거점',
            'coverage_or_benefit_eligibility_proven': False}
    if args.dry_run:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return 0
    key = read_key(args.env_file)
    if not key or key.startswith('__'):
        print('Missing KAKAO_REST_API_KEY; no API calls made. Set it in .env or the process environment.')
        return 2
    now = dt.datetime.now(dt.timezone.utc)
    out = root / '.local/place-search-trial' / now.strftime('%Y%m%dT%H%M%S%fZ')
    out.mkdir(parents=True, mode=0o700)
    result = {'started_at': now.isoformat(), 'plan': plan, 'requests': [], 'anchors': [],
              'status': 'running', 'semantic_review': 'pending', 'model_calls': 0}

    def save():
        (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

    def search(stage, params, center=None):
        record = {'stage': stage, 'params': params, 'requested_at': dt.datetime.now(dt.timezone.utc).isoformat()}
        result['requests'].append(record)
        request = urllib.request.Request(ENDPOINT + '?' + urllib.parse.urlencode({'page': 1, 'size': 15, **params}),
                                         headers={'Authorization': 'KakaoAK ' + key})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                record['http_status'] = response.status
                payload = json.load(response)
            record['meta'] = payload.get('meta')
            record['documents'] = payload.get('documents', [])
            for row in record['documents']:
                try:
                    row['coordinate_valid'] = -180 <= float(row['x']) <= 180 and -90 <= float(row['y']) <= 90
                    if center:
                        row['calculated_distance_m'] = distance(center, row)
                        row['within_radius'] = row['calculated_distance_m'] <= 3050
                except (KeyError, ValueError, TypeError):
                    row['coordinate_valid'] = False
            return record['documents']
        except urllib.error.HTTPError as error:
            record['http_status'] = error.code
            record['error'] = 'http_error'
            try:
                detail = json.loads(error.read(4096))
                record['api_error'] = {field: str(detail[field]).replace(key, '[REDACTED]')[:500]
                                       for field in ['code', 'errorType', 'message', 'msg'] if field in detail}
            except (ValueError, TypeError):
                record['api_error'] = {'message': 'Non-JSON error response'}
            raise RuntimeError('HTTP failure; inspect status in result.json') from None
        except (urllib.error.URLError, TimeoutError, ValueError):
            record['error'] = 'transport_or_json_error'
            raise RuntimeError('Transport/JSON failure') from None
        finally:
            save()

    try:
        for name in ANCHORS:
            search('natural_query', {'query': name + ' 근처 페트병 수거점'})
            candidates = search('resolve_anchor', {'query': name, 'category_group_code': 'SW8'})
            matches = [r for r in candidates if r.get('category_group_code') == 'SW8'
                       and re.fullmatch(re.escape(name) + r'(?:\s+.*)?', r.get('place_name', ''))
                       and r.get('coordinate_valid')]
            anchor = {'query': name, 'matching_candidates': len(matches)}
            result['anchors'].append(anchor)
            if len(matches) != 1:
                anchor['status'] = 'needs_confirmation'
                save()
                continue
            center = matches[0]
            anchor.update(status='resolved', place_id=center['id'], name=center['place_name'], x=center['x'], y=center['y'])
            for term in TERMS:
                search('nearby', {'query': term, 'x': center['x'], 'y': center['y'], 'radius': 3000, 'sort': 'distance'}, center)
        result['status'] = 'requests_completed'
    except RuntimeError as error:
        result.update(status='incomplete', error=str(error))
    finally:
        result['finished_at'] = dt.datetime.now(dt.timezone.utc).isoformat()
        save()
    print(json.dumps({'status': result['status'], 'calls': len(result['requests']), 'output': str(out / 'result.json')}, ensure_ascii=False))
    return 0 if result['status'] == 'requests_completed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
