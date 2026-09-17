ARG ES_VERSION=9.5.3
FROM docker.elastic.co/elasticsearch/elasticsearch:${ES_VERSION}
RUN bin/elasticsearch-plugin install --batch analysis-nori
COPY healthcheck.sh /usr/local/bin/eco-healthcheck
